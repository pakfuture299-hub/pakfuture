/**
 * Transport-agnostic conversation engine for the guided apply flow.
 *
 * Unlike the legacy Telegram-only conversation.js, this module knows nothing
 * about Telegram or HTTP: it takes a session + a message and returns the next
 * reply + the updated session. The thin wrappers (conversation.js for the
 * Telegram webhook, chat.js for the storefront widget) handle transport.
 *
 * Flow states (matches the product-owner spec):
 *   idle                    → short greeting + "how can I help?" (no pitch)
 *   (job Q&A via askGrounded — no pitch, no links)
 *   awaiting_interest       → after job interest: pitch (why Telegram) +
 *                             tutorial links (VPN/app/video) → "want to apply?"
 *   awaiting_apply_decision → yes → collect details; no → polite close
 *   awaiting_name           → collect full name
 *   awaiting_phone          → collect contact number
 *   awaiting_telegram       → collect Telegram username/number
 *   awaiting_confirm        → confirm details → submit → invite link + done
 *   done                    → soft "already submitted" reply
 *
 * Language: if the candidate writes in Roman Urdu/Hinglish the replies switch
 * to Hinglish (RULES_HI). Detection is deterministic (marker words), never a
 * model decision.
 */

const { classifyIntent, askGrounded } = require('./openai');
const { submitCandidate } = require('./submission');
const {
  RULES,
  RULES_HI,
  PITCH,
  TELEGRAM_HELP,
  STORE,
  SENTIMENTS,
} = require('../knowledge/base');
const {
  isValidName,
  isValidPhone,
  isValidTelegram,
  normalizeText,
  isRedirectTrigger,
} = require('../utils/validation');
const logger = require('../utils/logger');

const EMPTY_ANSWER_SENTINEL = 'EMPTY_ANSWER';

/** Roman Urdu / Hinglish marker words (lowercase, exact or word-boundary). */
const HI_MARKERS = [
  'haan', 'nahi', 'nai', 'nhi', 'kya', 'karo', 'karein', 'chahiye', 'chahie',
  'aap', 'aapka', 'aapki', 'batao', 'bataiye', 'bhai', 'salam', 'kaam',
  'ji', 'hn', 'hain', 'hai', 'kahan', 'kaise', 'kis', 'mera', 'meri',
  'mujhe', 'main', 'apna', 'apni', 'wala', 'wali', 'shukriya', 'masalan',
  'kar', 'raha', 'rahi', 'karna', 'krna', 'mil', 'deta', 'deti',
  'konsi', 'kaunsi', 'kaun', 'kaun si', 'jobs', 'job', 'hota', 'hoti',
  'karte', 'karti', 'karta', 'bana', 'banna', 'aana', 'aati', 'aata',
  'kisam', 'kism', 'kitni', 'kitna', 'kahan se', 'kab', 'zaroorat',
  'hai kya', 'hain kya',
];

/** Words that look like a "no" answer (Hinglish + English). */
const NO_WORDS = ['nahi', 'nai', 'nhi', 'na', 'no', 'nope', 'nhi hai', 'nahi hai'];
/** Words that look like a "yes" answer (Hinglish + English). */
const YES_WORDS = [
  'haan', 'han', 'hn', 'ji', 'ji haan', 'ji han', 'yes', 'yep', 'yeah',
  'pehle se bana', 'bana hua', 'hai', 'yes hai', 'haan hai',
];

/**
 * Heuristic-only: detect whether the candidate is writing Roman Urdu/Hinglish.
 * Returns 'hi' or 'en'. A strong single marker (haan/nahi/ji) is enough;
 * otherwise two or more markers tip the balance.
 */
function detectLanguage(text) {
  const words = normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9@+]+/)
    .filter(Boolean);

  let hits = 0;
  for (const w of words) {
    if (HI_MARKERS.includes(w)) hits += 1;
  }

  const strong = ['haan', 'nahi', 'nai', 'nhi', 'ji', 'shukriya', 'chahiye', 'kya'];
  if (words.some((w) => strong.includes(w))) return 'hi';
  return hits >= 2 ? 'hi' : 'en';
}

/**
 * True when the message is unambiguously English — enough to move a Hinglish
 * session back to English. Used so a Hinglish session isn't stuck forever:
 * "what is the salary" flips back, while "ok" / "yes" / "no" (which are also
 * Hinglish words) don't.
 */
function isStrongEnglish(text) {
  const t = normalizeText(text).toLowerCase();
  return /(^|\s)(what|which|how|where|when|why|is|are|do|does|can|tell|explain|salary|job|jobs|apply|work|earn|payment|hours|time|requirements|need|have|has|help)\b/.test(t);
}

/** True when the message looks like a plain "yes" answer. */
function isYes(text) {
  const t = normalizeText(text).toLowerCase();
  return YES_WORDS.some((w) => new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(t));
}

/** True when the message looks like a plain "no" answer. */
function isNo(text) {
  const t = normalizeText(text).toLowerCase();
  return NO_WORDS.some((w) => new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(t));
}

/**
 * Deterministic sentiment / small-talk detection. Runs BEFORE any AI call so
 * "how are you", "thanks", "bye" etc. always get a warm reply — even when
 * OpenAI is slow or down (the widget previously showed "something went wrong"
 * when the AI call failed mid-conversation).
 * Returns a SENTIMENTS key ('howAreYou' | 'thanks' | 'bye' | 'goodMorning' |
 * 'goodAfternoon' | 'goodEvening' | 'ok' | 'intro') or null when the message
 * is not small talk.
 */
function detectSentiment(text) {
  const t = normalizeText(text).toLowerCase();

  if (/(\bhow are you\b|\bhow r u\b|\bkaise ho\b|\bkaisi ho\b|\bhow do you do\b|\bhow's it going\b|\bhow are things\b)/.test(t)) {
    return 'howAreYou';
  }
  if (/(\bthanks\b|\bthank you\b|\bthank u\b|\bshukriya\b|\bthx\b|\bty\b|\bthankyou\b|\bmany thanks\b|\bthank-you\b)/.test(t)) {
    return 'thanks';
  }
  if (/(\bbye\b|\bgoodbye\b|\bsee you\b|\bsee ya\b|\ballah hafiz\b|\bkhuda hafiz\b|\bgood night\b|\bgoodnight\b|\btake care\b)/.test(t)) {
    return 'bye';
  }
  if (/(\bgood morning\b|\bsubah bakhair\b|\bmorning\b)/.test(t)) {
    return 'goodMorning';
  }
  if (/(\bgood afternoon\b|\bdo pehar bakhair\b|\bafternoon\b)/.test(t)) {
    return 'goodAfternoon';
  }
  if (/(\bgood evening\b|\bshaam bakhair\b|\bevening\b)/.test(t)) {
    return 'goodEvening';
  }
  if (/^(\bok\b|\bokay\b|\boki\b|\bokayy\b|\balright\b|\bsure\b|\bfine\b|\btheek hai\b|\bthik hai\b|\bchalo\b|\bgo ahead\b|\bkar do\b|\bkar dein\b)$/.test(t)) {
    return 'ok';
  }
  if (/(\bwho are you\b|\bap kon ho\b|\baap kaun ho\b|\bap kaun hain\b|\bwhat are you\b|\bwhat can you do\b|\btum kya kar sakte ho\b)/.test(t)) {
    return 'intro';
  }
  return null;
}

/**
 * True when the message looks like a question (English or Hinglish), but NOT
 * a bare greeting ("hello?", "hi?") or small talk — those are greetings.
 */
function looksLikeQuestion(text) {
  const t = normalizeText(text).toLowerCase();
  // Pure greeting / small talk with a trailing ? is still just a greeting.
  if (/^(hi|hello|hey|salam|assalam|good morning|good afternoon|good evening|kaise ho|kya haal|sab kuch)\b/.test(t)) {
    return false;
  }
  return /(\?$)|(^|\s)(konsi|kaunsi|kaun si|kya|kyun|kaise|kaisee|which|what|how|where|when|why|is|are|do|does|can|tell me|batao|bataiye|bataye|share)\b/i.test(t);
}

/** Build a fresh session. */
function createSession() {
  return {
    state: 'idle',
    lang: 'en',
    name: null,
    phone: null,
    telegram: null,
    updatedAt: Date.now(),
  };
}

/** Pick the rule set for the session's language. */
function rulesFor(session) {
  return session.lang === 'hi' ? RULES_HI : RULES;
}

/** The Telegram help guide (VPN → app → video → join), localized intro. */
function telegramHelpReply(session) {
  const intro = session.lang === 'hi' ? RULES_HI.telegramHelpIntro : TELEGRAM_HELP.intro;
  return intro + '\n\n' + TELEGRAM_HELP.steps.join('\n');
}

/**
 * Short greeting — just a friendly intro + "how can I help?", no pitch.
 * The pitch comes later, only once the candidate shows interest.
 */
function shortGreetingReply(session) {
  return rulesFor(session).shortGreeting;
}

/**
 * The interest → pitch step: explains why Telegram, provides the setup links
 * (VPN / app / video), then asks whether they want to apply.
 */
function pitchAndAskReply(session) {
  const R = rulesFor(session);
  const pitch = session.lang === 'hi' ? PITCH.hi : PITCH.en;
  const links = rulesFor(session).noTelegramGuide || telegramHelpReply(session);
  const parts = [
    R.interestPrompt,
    pitch,
    links,
    R.applyAsk,
  ];
  return parts.join('\n\n');
}

/** Polite close when the candidate is not interested in applying. */
function notInterestedReply(session) {
  return rulesFor(session).notInterested;
}

/** Final reply after a successful submission: invite link + confirmation. */
function submittedReply(session) {
  const R = rulesFor(session);
  return (
    R.submitted +
    '\n\n' +
    R.inviteLinkLine
  );
}

/** Validate + extract a field answer from free text. */
function extractFieldAnswer(message, field) {
  const s = normalizeText(message);
  if (!s || s.length > 120) return EMPTY_ANSWER_SENTINEL;
  return s;
}

/**
 * Handle one message for a session. Pure-ish: mutates and returns the session
 * alongside the reply, so the caller decides where to persist it.
 * @returns {Promise<{reply: string, session: object, submitted?: boolean}>}
 */
async function processMessage(session, message) {
  const text = normalizeText(message);
  if (!text) return { reply: shortGreetingReply(session), session };

  // Cheap offline guardrail first (no AI call for obvious off-topic).
  if (isRedirectTrigger(text)) {
    return { reply: rulesFor(session).outOfScopeRedirect, session };
  }

  // Language detection — re-run on every message so a candidate who switches
  // from English to Roman Urdu/Hinglish mid-conversation gets replies in the
  // language they are actually writing. A session only flips to 'en' when the
  // current message is clearly English (strong-en marker), and only flips to
  // 'hi' on strong Hinglish markers — so one stray English word doesn't flip
  // a Hinglish session back and forth.
  if (session.state !== 'awaiting_name' && session.state !== 'awaiting_phone') {
    const lang = detectLanguage(text);
    if (lang === 'hi') {
      session.lang = 'hi';
    } else if (lang === 'en' && isStrongEnglish(text)) {
      session.lang = 'en';
    }
  }

  // Sentiments / small talk are handled deterministically — no AI call, so
  // they work even when OpenAI is down (and never end up in the generic
  // redirect path). Only after the field-collection states (name/phone/
  // telegram) does a sentiment answer NOT override the flow.
  const sentiment = detectSentiment(text);
  if (
    sentiment &&
    !['awaiting_name', 'awaiting_phone', 'awaiting_telegram', 'awaiting_confirm'].includes(
      session.state
    )
  ) {
    const R = session.lang === 'hi' ? SENTIMENTS.hi : SENTIMENTS.en;
    return { reply: R[sentiment], session };
  }

  // Re-route Telegram help requests at any point in the flow.
  const intent = await classifyIntent(text);
  if (intent.telegramHelpRequested || intent.intent === 'telegram_help') {
    return { reply: telegramHelpReply(session), session };
  }

  switch (session.state) {
    case 'idle': {
      let reply;
      if (intent.intent === 'greeting') {
        // "konsi jobs hain?" mislabeled as greeting must still be answered
        // from the knowledge base, not given a greeting.
        if (looksLikeQuestion(text)) {
          const answer = await askGrounded(message, session.lang);
          if (answer.outOfScope) {
            reply = rulesFor(session).outOfScopeRedirect;
          } else if (answer.applyFlow) {
            reply = pitchAndAskReply(session);
            session.state = 'awaiting_apply_decision';
          } else if (answer.telegramHelp) {
            reply = telegramHelpReply(session);
          } else {
            reply = answer.text + '\n\n' + rulesFor(session).interestPrompt;
            session.state = 'awaiting_interest';
          }
        } else {
          // Just a friendly intro — no pitch yet.
          reply = shortGreetingReply(session);
        }
      } else if (intent.intent === 'apply') {
        // Straight to the pitch + apply ask.
        reply = pitchAndAskReply(session);
        session.state = 'awaiting_apply_decision';
      } else if (intent.intent === 'provide_info') {
        const answer = await askGrounded(message, session.lang);
        if (answer.outOfScope) {
          reply = rulesFor(session).outOfScopeRedirect;
        } else if (answer.applyFlow) {
          reply = pitchAndAskReply(session);
          session.state = 'awaiting_apply_decision';
        } else if (answer.telegramHelp) {
          reply = telegramHelpReply(session);
        } else {
          // Real answer about a job — follow with a gentle interest prompt.
          reply = answer.text + '\n\n' + rulesFor(session).interestPrompt;
          session.state = 'awaiting_interest';
        }
      } else {
        reply = rulesFor(session).outOfScopeRedirect;
      }
      return { reply, session };
    }

    case 'awaiting_interest': {
      // Candidate just answered a job question; they may ask more or show intent.
      if (intent.intent === 'out_of_scope') {
        return { reply: rulesFor(session).outOfScopeRedirect, session };
      }
      if (intent.intent === 'apply') {
        session.state = 'awaiting_apply_decision';
        return { reply: pitchAndAskReply(session), session };
      }
      // A follow-up question ("konsi jobs hain?", "what is data entry?")
      // should be answered from the knowledge base, never absorbed into the
      // pitch. The classifier may mislabel these as greeting/other, so a
      // message that *looks* like a question is treated as provide_info too.
      if (intent.intent === 'provide_info' || looksLikeQuestion(text)) {
        const answer = await askGrounded(message, session.lang);
        if (answer.outOfScope) return { reply: rulesFor(session).outOfScopeRedirect, session };
        if (answer.applyFlow) {
          session.state = 'awaiting_apply_decision';
          return { reply: pitchAndAskReply(session), session };
        }
        if (answer.telegramHelp) return { reply: telegramHelpReply(session), session };
        // Still exploring — answer and keep the interest prompt.
        return { reply: answer.text + '\n\n' + rulesFor(session).interestPrompt, session };
      }
      // An explicit "yes / interested" or plain confirmation → pitch + apply ask.
      if (isYes(text) || /interest|interested|chahiye|chahie|karna chahta|karna chahti/i.test(text)) {
        session.state = 'awaiting_apply_decision';
        return { reply: pitchAndAskReply(session), session };
      }
      // Anything else → pitch + apply ask (candidate engaged but unclear).
      session.state = 'awaiting_apply_decision';
      return { reply: pitchAndAskReply(session), session };
    }

    case 'awaiting_apply_decision': {
      // Deterministic yes/no — no model call needed here.
      if (isYes(text)) {
        session.state = 'awaiting_name';
        return { reply: rulesFor(session).askName, session };
      }
      if (isNo(text)) {
        session.state = 'done';
        return { reply: notInterestedReply(session), session };
      }
      // A clear out-of-context question while waiting for yes/no → redirect.
      if (intent.intent === 'out_of_scope') {
        return { reply: rulesFor(session).outOfScopeRedirect, session };
      }
      // A follow-up question while waiting for yes/no ("konsi jobs hain?")
      // should be answered, not absorbed into the pitch or repeated ask.
      if (intent.intent === 'provide_info' || looksLikeQuestion(text)) {
        const answer = await askGrounded(message, session.lang);
        if (answer.outOfScope) return { reply: rulesFor(session).outOfScopeRedirect, session };
        if (answer.applyFlow) return { reply: pitchAndAskReply(session), session };
        if (answer.telegramHelp) return { reply: telegramHelpReply(session), session };
        // Answer the question, then still ask whether they want to apply.
        return { reply: answer.text + '\n\n' + rulesFor(session).applyAsk, session };
      }
      return { reply: rulesFor(session).applyAsk, session };
    }

    case 'awaiting_name': {
      const raw = extractFieldAnswer(message, 'name');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidName(raw)) {
        return { reply: rulesFor(session).nameInvalid || RULES.nameInvalid, session };
      }
      session.name = raw;
      session.state = 'awaiting_phone';
      return { reply: rulesFor(session).askPhone, session };
    }

    case 'awaiting_phone': {
      const raw = extractFieldAnswer(message, 'phone');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidPhone(raw)) {
        return { reply: rulesFor(session).phoneInvalid, session };
      }
      session.phone = raw;
      session.state = 'awaiting_telegram';
      return { reply: rulesFor(session).askTelegram, session };
    }

    case 'awaiting_telegram': {
      const raw = extractFieldAnswer(message, 'telegram');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidTelegram(raw)) {
        return { reply: rulesFor(session).telegramInvalid, session };
      }
      session.telegram = raw;
      session.state = 'awaiting_confirm';
      const R = rulesFor(session);
      const confirm =
        R.confirmHeader +
        `\n• Name: ${session.name}\n• Phone: ${session.phone}\n• Telegram: ${session.telegram}` +
        `\n\n${R.confirmPrompt}`;
      return { reply: confirm, session };
    }

    case 'awaiting_confirm': {
      const lower = text.toLowerCase();

      if (isYes(text)) {
        const result = submitCandidate(session);
        if (result.ok) {
          session.state = 'done';
          return { reply: submittedReply(session), session, submitted: true };
        }
        if (result.duplicate) {
          session.state = 'done';
          return { reply: rulesFor(session).duplicate, session, submitted: true };
        }
        return { reply: rulesFor(session).error, session };
      }

      if (/\bname\b/.test(lower) || /naam/i.test(lower)) {
        session.name = null;
        session.state = 'awaiting_name';
        return { reply: rulesFor(session).askName, session };
      }
      if (/\bphone\b|\bnumber\b/.test(lower)) {
        session.phone = null;
        session.state = 'awaiting_phone';
        return { reply: rulesFor(session).askPhone, session };
      }
      if (/telegram/i.test(lower)) {
        session.telegram = null;
        session.state = 'awaiting_telegram';
        return { reply: rulesFor(session).askTelegram, session };
      }
      return { reply: rulesFor(session).confirmPrompt, session };
    }

    case 'done': {
      // A completed applicant may come back with a new question or just say
      // hi again. Treat the message like a fresh conversation (reset to
      // idle), while submission-level duplicate detection still protects the
      // sheet if they re-apply with the same details.
      session.state = 'idle';
      return processMessage(session, message);
    }

    default: {
      logger.warn('Unknown session state, resetting', { state: session.state });
      const fresh = createSession();
      return { reply: shortGreetingReply(fresh), session: fresh };
    }
  }
}

module.exports = { processMessage, createSession, detectLanguage, detectSentiment, isYes, isNo };
