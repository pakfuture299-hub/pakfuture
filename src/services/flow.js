/**
 * Transport-agnostic conversation engine for the guided apply flow.
 *
 * Unlike the legacy Telegram-only conversation.js, this module knows nothing
 * about Telegram or HTTP: it takes a session + a message and returns the next
 * reply + the updated session. The thin wrappers (conversation.js for the
 * Telegram webhook, chat.js for the storefront widget) handle transport.
 *
 * Flow states:
 *   idle                 → greeting + pitch → ask "do you have Telegram?"
 *   awaiting_telegram_has → yes → askName; no → Telegram help guide → askName
 *   awaiting_name        → collect full name
 *   awaiting_phone       → collect contact number
 *   awaiting_telegram    → collect Telegram username/number
 *   awaiting_confirm     → confirm details → submitCandidate → done
 *   done                 → soft "already submitted" reply
 *
 * Language: if the candidate writes in Roman Urdu/Hinglish the replies switch
 * to Hinglish (RULES_HI). Detection is deterministic (marker words), never a
 * model decision.
 */

const { classifyIntent, askGrounded } = require('./openai');
const { submitCandidate } = require('./submission');
const { RULES, RULES_HI, PITCH, TELEGRAM_HELP, STORE } = require('../knowledge/base');
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

/** Greeting + pitch + "do you have Telegram?" — the entry into the flow. */
function greetingPitchReply(session) {
  const R = rulesFor(session);
  const pitch = session.lang === 'hi' ? PITCH.hi : PITCH.en;
  const parts = [R.greeting];
  if (session.lang === 'hi') parts.push(RULES_HI.pitchIntro);
  parts.push(pitch);
  parts.push(R.askHasTelegram);
  return parts.join('\n\n');
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
  if (!text) return { reply: greetingPitchReply(session), session };

  // Cheap offline guardrail first (no AI call for obvious off-topic).
  if (isRedirectTrigger(text)) {
    return { reply: rulesFor(session).outOfScopeRedirect, session };
  }

  // Language detection (only meaningful before the flow is deep in English).
  if (session.state === 'idle' || session.state === 'awaiting_telegram_has') {
    session.lang = detectLanguage(text);
  }

  // Re-route Telegram help requests at any point in the flow.
  const intent = await classifyIntent(text);
  if (intent.telegramHelpRequested || intent.intent === 'telegram_help') {
    return { reply: telegramHelpReply(session), session };
  }

  switch (session.state) {
    case 'idle': {
      let reply;
      if (intent.intent === 'greeting' || intent.intent === 'apply') {
        // Greeting OR an explicit "I want to apply" both start the flow.
        reply = greetingPitchReply(session);
        session.state = 'awaiting_telegram_has';
      } else if (intent.intent === 'provide_info') {
        const answer = await askGrounded(message);
        if (answer.outOfScope) {
          reply = rulesFor(session).outOfScopeRedirect;
        } else if (answer.applyFlow) {
          reply = greetingPitchReply(session);
          session.state = 'awaiting_telegram_has';
        } else if (answer.telegramHelp) {
          reply = telegramHelpReply(session);
        } else {
          reply = answer.text;
        }
      } else {
        reply = rulesFor(session).outOfScopeRedirect;
      }
      return { reply, session };
    }

    case 'awaiting_telegram_has': {
      // Deterministic yes/no — no model call needed here.
      if (isYes(text)) {
        session.state = 'awaiting_name';
        return { reply: rulesFor(session).askName, session };
      }
      if (isNo(text)) {
        session.state = 'awaiting_name';
        const guide = rulesFor(session).noTelegramGuide || telegramHelpReply(session);
        return { reply: guide + '\n\n' + rulesFor(session).askName, session };
      }
      // Unclear answer — repeat the question.
      return { reply: rulesFor(session).askHasTelegram, session };
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
          return { reply: rulesFor(session).submitted, session, submitted: true };
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
      return { reply: rulesFor(session).done || RULES.done || RULES.submitted, session };
    }

    default: {
      logger.warn('Unknown session state, resetting', { state: session.state });
      const fresh = createSession();
      return { reply: greetingPitchReply(fresh), session: fresh };
    }
  }
}

module.exports = { processMessage, createSession, detectLanguage, isYes, isNo };
