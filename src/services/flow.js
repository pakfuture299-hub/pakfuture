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
const { JOBS } = require('../knowledge/base');
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
 * True when the candidate is backing out / cancelling the application —
 * "i'm no longer interested", "cancel", "chhod do", "band karo", "not
 * interested" etc. Distinct from a plain "no" so a terse "no" to a yes/no
 * prompt still flows normally.
 */
function isCancelling(text) {
  const t = normalizeText(text).toLowerCase();
  return /(no longer|not (?:interested|now)|cancel|abort|stop|quit|skip|leave|drop|forget it|chhod|chor do|band karo|nahi karna|nhi karna|nahi chahiye|nhi chahiye|nahi karna chahta|nhi karna chahta|nahi karni|nhi karni|apply nahi|nahi apply|i don'?t want|i dont want|mat karo|mat karna)/.test(t);
}

/**
 * True when the candidate is asking about Telegram setup / says they don't
 * have Telegram — checked deterministically so a misclassified help request
 * during the flow still gets the setup guide instead of a validation error.
 */
function asksTelegramHelp(text) {
  const t = normalizeText(text).toLowerCase();
  return /(telegram (nahi|nhi|how|kya|install|download|setup|banao|banana|kaise|kya hai|aata|aati)|nahi (hai|pata).*telegram|nhi (hai|pata).*telegram|telegram.*(nahi|nhi)|how (to )?(install|use|join|make).*telegram|telegram account)/.test(t);
}

/**
 * True when the candidate raises a security / privacy / trust concern about
 * sharing their details — "security concerns", "safe hai", "data kahan
 * jayegi", "is this safe", "trust you", etc.
 */
function asksSecurity(text) {
  const t = normalizeText(text).toLowerCase();
  return /(security|secure|safe|privacy|private|data (kahan|kaise|leak)|leak|trust|trusted|scam|fraud|risk|khof|dar|mehfooz|confidential|personal info|personal information|details (safe|share|dein|du\b)|share.*details|why.*(need|ask).*(number|phone|info)|kya.*zaroorat|information kahan)/.test(t);
}

/**
 * True when the message names one of our jobs — used to force a job answer
 * even when the classifier says out_of_scope or greeting.
 */
function namesJob(text) {
  return matchJob(text) !== null;
}

/**
 * True when the candidate is asking a general knowledge question that the
 * FAQ covers (earnings, fees, timing, trust, who can apply, etc.) — used so
 * a misclassified FAQ question still gets a grounded answer, never a
 * redirect.
 */
const FAQ_QUESTION_RE = /(earn|earning|salary|payment|pay|fee|fees|register|registration|investment|trusted|trust|scam|legit|student|housewife|students|housewives|hour|hours|time|timing|work from home|online|age|experience|qualification|laptop|computer|how (to )?apply|apply (karna|karne)|kya (hai|hoga)|kaise (hota|hogga)|kitna|kitni|kab)/;
function asksKnowledgeQuestion(text) {
  const t = normalizeText(text).toLowerCase();
  return FAQ_QUESTION_RE.test(t);
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

/**
 * Deterministic job matcher: map a loose user phrasing ("graphic design",
 * "video editing", "data entry") to the canonical job name in the knowledge
 * base. Runs BEFORE the AI decides out-of-scope, so a candidate naming a real
 * job never gets the "I can only help with our jobs" redirect.
 * Returns the matched job object or null.
 */
const JOB_ALIASES = [
  { job: JOBS[0], keys: ['video watch', 'video earn', 'watch and earn', 'watch video', 'watch ads', 'ad watching', 'ads watching', 'video wala', 'video wali', 'video dekho'] },
  { job: JOBS[1], keys: ['assignment'] },
  { job: JOBS[2], keys: ['content writ', 'content'] },
  { job: JOBS[3], keys: ['graphic', 'designer', 'design'] },
  { job: JOBS[4], keys: ['travel', 'booking', 'travel booking'] },
  { job: JOBS[5], keys: ['video edit', 'video editor', 'editing', 'video editing'] },
  { job: JOBS[6], keys: ['digital marketing', 'marketing', 'marketing job'] },
  { job: JOBS[7], keys: ['data entry', 'data typing', 'typing', 'data'] },
  { job: JOBS[8], keys: ['virtual assistant', 'amazon va', 'amazon virtual', 'amazon assistant', 'va job'] },
  { job: JOBS[9], keys: ['amazon fba', 'fba', 'amazon'] },
];

function matchJob(text) {
  const t = normalizeText(text).toLowerCase();
  for (const { job, keys } of JOB_ALIASES) {
    if (keys.some((k) => t.includes(k))) return job;
  }
  return null;
}

/**
 * A friendly, detailed walkthrough of a job (name + summary + requirements +
 * how to apply) when the knowledge base has that detail — so a candidate
 * asking about a job gets proper details, not just a one-liner.
 */
function jobSummary(job) {
  const lines = [`${job.name}${job.summary ? ': ' + job.summary : ''}`];
  if (Array.isArray(job.requirements) && job.requirements.length) {
    lines.push(`Requirements:`);
    for (const r of job.requirements) lines.push(`• ${r}`);
  }
  if (Array.isArray(job.whyJoin) && job.whyJoin.length) {
    lines.push(`Why join:`);
    for (const w of job.whyJoin) lines.push(`• ${w}`);
  }
  if (job.howToApply) {
    lines.push(`How to apply: ${job.howToApply}`);
  }
  return lines.join('\n');
}

/** Build a fresh session. */
function createSession() {
  return {
    state: 'idle',
    lang: 'en',
    name: null,
    phone: null,
    telegram: null,
    job: null, // canonical job name the candidate is interested in
    updatedAt: Date.now(),
  };
}

/** Pick the rule set for the session's language. */
function rulesFor(session) {
  return session.lang === 'hi' ? RULES_HI : RULES;
}

/** The field prompt to re-ask for a given field-collection state. */
function fieldReask(session) {
  const R = rulesFor(session);
  switch (session.state) {
    case 'awaiting_name': return R.askName;
    case 'awaiting_phone': return R.askPhone;
    case 'awaiting_telegram': return R.askTelegram;
    case 'awaiting_confirm': return R.confirmPrompt;
    default: return null;
  }
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
 * Handle a side-question (job details, knowledge, security, telegram help)
 * that arrives mid field-collection: answer it, then re-ask the field so the
 * application flow is never lost. Returns null when the message isn't a
 * side-question (i.e. it's a real field answer or invalid input).
 */
async function sideQuestionInField(session, message) {
  if (asksSecurity(message)) {
    return rulesFor(session).securityReassurance + '\n\n' + fieldReask(session);
  }
  if (asksTelegramHelp(message)) {
    return telegramHelpReply(session) + '\n\n' + fieldReask(session);
  }
  // Job names ("what is data entry?") and knowledge questions ("how much can
  // i earn?") are answered from the knowledge base.
  if (namesJob(message) || asksKnowledgeQuestion(message) || looksLikeQuestion(message)) {
    const answer = await answerQuestion(session, message);
    if (answer === null) return null;
    if (answer.applyFlow) return null; // "i want to apply" — handled by state
    if (answer.telegramHelp) return telegramHelpReply(session) + '\n\n' + fieldReask(session);
    return answer + '\n\n' + fieldReask(session);
  }
  return null;
}

/**
 * Build a grounded answer about a job (or general knowledge) and attach the
 * matched job to the session. Returns the reply text (without the interest
 * prompt) or null when the answer is out of scope.
 */
async function answerQuestion(session, message) {
  // Deterministic job match first: a candidate naming a real job (possibly
  // by a loose name) always gets the job's details, never a redirect.
  const matched = matchJob(message);
  if (matched) {
    session.job = matched.name;
    return jobSummary(matched);
  }
  const answer = await askGrounded(message, session.lang);
  if (answer.outOfScope) return null;
  if (answer.applyFlow) return { applyFlow: true };
  if (answer.telegramHelp) return { telegramHelp: true };
  // Track the job when the model's answer names one of our jobs.
  if (!session.job) {
    const m = matchJob(answer.text);
    if (m) session.job = m.name;
  }
  return answer.text;
}

/**
 * Defensive fallback: when the classifier says out_of_scope (or greeting) but
 * the message clearly names a job or asks a knowledge-base question, still
 * answer it instead of redirecting. Returns the answer or null.
 */
async function defensiveAnswer(session, message) {
  if (namesJob(message) || asksKnowledgeQuestion(message) || looksLikeQuestion(message)) {
    return answerQuestion(session, message);
  }
  return null;
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

  // Universal "I'm out" — a candidate who backs out at ANY point (even mid
  // field collection) gets a polite close and a done state, never another
  // field prompt. This is the escape hatch for every state.
  if (isCancelling(text)) {
    session.state = 'done';
    return { reply: notInterestedReply(session), session };
  }

  // Universal Telegram-help fallback — checked before the model so a
  // misclassified "telegram nahi pata" during the flow never lands in a
  // validation-error loop.
  if (asksTelegramHelp(text)) {
    return { reply: telegramHelpReply(session), session };
  }

  // Universal security-reassurance fallback — a candidate who raises a
  // privacy/trust concern at ANY point gets a reassuring answer. In a
  // field-collection state we append the field re-ask so the flow continues.
  if (asksSecurity(text)) {
    const R = rulesFor(session);
    const reask = fieldReask(session);
    return { reply: reask ? R.securityReassurance + '\n\n' + reask : R.securityReassurance, session };
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

  // In field-collection states, a back-out ("no thanks", "no, cancel",
  // "no stop", "nahi") must beat the sentiment handler, which would otherwise
  // reply "you're welcome" and keep asking for the field forever. A bare
  // "no problem" / "no worries" (dismissive, not a refusal) does NOT close.
  if (
    isNo(text) &&
    !/(no (problem|worries|issue|prob|thanks to you))/.test(text) &&
    ['awaiting_name', 'awaiting_phone', 'awaiting_telegram', 'awaiting_confirm'].includes(session.state)
  ) {
    session.state = 'done';
    return { reply: notInterestedReply(session), session };
  }

  // Sentiments / small talk are handled deterministically — no AI call, so
  // they work even when OpenAI is down (and never end up in the generic
  // redirect path). In field-collection states the warm reply is followed by
  // the field re-ask so the flow is never lost.
  const sentiment = detectSentiment(text);
  if (sentiment) {
    const R = session.lang === 'hi' ? SENTIMENTS.hi : SENTIMENTS.en;
    const reask = fieldReask(session);
    return { reply: reask ? R[sentiment] + '\n\n' + reask : R[sentiment], session };
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
          const answer = await answerQuestion(session, message);
          if (answer === null) {
            reply = rulesFor(session).outOfScopeRedirect;
          } else if (answer.applyFlow) {
            reply = pitchAndAskReply(session);
            session.state = 'awaiting_apply_decision';
          } else if (answer.telegramHelp) {
            reply = telegramHelpReply(session);
          } else {
            reply = answer + '\n\n' + rulesFor(session).interestPrompt;
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
        const answer = await answerQuestion(session, message);
        if (answer === null) {
          reply = rulesFor(session).outOfScopeRedirect;
        } else if (answer.applyFlow) {
          reply = pitchAndAskReply(session);
          session.state = 'awaiting_apply_decision';
        } else if (answer.telegramHelp) {
          reply = telegramHelpReply(session);
        } else {
          // Real answer about a job — follow with a gentle interest prompt.
          reply = answer + '\n\n' + rulesFor(session).interestPrompt;
          session.state = 'awaiting_interest';
        }
      } else {
        // Classifier said out_of_scope, but if the message names a real job
        // or asks a knowledge-base question, still answer it (never redirect
        // a legitimate job question).
        const answer = await defensiveAnswer(session, message);
        if (answer === null) {
          reply = rulesFor(session).outOfScopeRedirect;
        } else if (answer.applyFlow) {
          reply = pitchAndAskReply(session);
          session.state = 'awaiting_apply_decision';
        } else if (answer.telegramHelp) {
          reply = telegramHelpReply(session);
        } else {
          reply = answer + '\n\n' + rulesFor(session).interestPrompt;
          session.state = 'awaiting_interest';
        }
      }
      return { reply, session };
    }

    case 'awaiting_interest': {
      // Candidate just answered a job question; they may ask more or show intent.
      if (intent.intent === 'out_of_scope') {
        // If it names a real job or asks a knowledge question, answer it —
        // only a genuinely off-topic message gets the redirect.
        const answer = await defensiveAnswer(session, message);
        if (answer === null) return { reply: rulesFor(session).outOfScopeRedirect, session };
        if (answer.applyFlow) {
          session.state = 'awaiting_apply_decision';
          return { reply: pitchAndAskReply(session), session };
        }
        if (answer.telegramHelp) return { reply: telegramHelpReply(session), session };
        return { reply: answer + '\n\n' + rulesFor(session).interestPrompt, session };
      }
      // "no" to the interest prompt → polite close, not the pitch.
      if (isNo(text)) {
        session.state = 'done';
        return { reply: notInterestedReply(session), session };
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
        const answer = await answerQuestion(session, message);
        if (answer === null) return { reply: rulesFor(session).outOfScopeRedirect, session };
        if (answer.applyFlow) {
          session.state = 'awaiting_apply_decision';
          return { reply: pitchAndAskReply(session), session };
        }
        if (answer.telegramHelp) return { reply: telegramHelpReply(session), session };
        // Still exploring — answer and keep the interest prompt.
        return { reply: answer + '\n\n' + rulesFor(session).interestPrompt, session };
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
      // A clear out-of-context question while waiting for yes/no — but a real
      // job name or knowledge question is still answered, not redirected.
      if (intent.intent === 'out_of_scope') {
        const answer = await defensiveAnswer(session, message);
        if (answer === null) return { reply: rulesFor(session).outOfScopeRedirect, session };
        if (answer.applyFlow) return { reply: pitchAndAskReply(session), session };
        if (answer.telegramHelp) return { reply: telegramHelpReply(session), session };
        return { reply: answer + '\n\n' + rulesFor(session).applyAsk, session };
      }
      // A follow-up question while waiting for yes/no ("konsi jobs hain?")
      // should be answered, not absorbed into the pitch or repeated ask.
      if (intent.intent === 'provide_info' || looksLikeQuestion(text)) {
        const answer = await answerQuestion(session, message);
        if (answer === null) return { reply: rulesFor(session).outOfScopeRedirect, session };
        if (answer.applyFlow) return { reply: pitchAndAskReply(session), session };
        if (answer.telegramHelp) return { reply: telegramHelpReply(session), session };
        // Answer the question, then still ask whether they want to apply.
        return { reply: answer + '\n\n' + rulesFor(session).applyAsk, session };
      }
      return { reply: rulesFor(session).applyAsk, session };
    }

    case 'awaiting_name': {
      // A side-question (security concern, job details, knowledge question)
      // mid-application: answer it and re-ask for the name.
      const side = await sideQuestionInField(session, message);
      if (side) return { reply: side, session };
      // The candidate may name a job ("i want to apply for data entry") or
      // ask "which job?" instead of giving their name. Capture the job and
      // keep asking for the name — never store a job name as the person's name.
      const matchedJob = matchJob(text);
      if (matchedJob) {
        session.job = matchedJob.name;
        const R = rulesFor(session);
        const ack = session.lang === 'hi'
          ? `Theek hai — ${matchedJob.name} ke liye apply! 👍`
          : `Got it — applying for ${matchedJob.name}! 👍`;
        return { reply: ack + '\n\n' + R.askName, session };
      }
      // "which job am i applying for?" — answer and repeat the name ask.
      if (/konsi job|kaun si job|which job|what job|job ke liye|apply kar rahe/i.test(text)) {
        const R = rulesFor(session);
        const current = session.job
          ? (session.lang === 'hi'
            ? `Aap ${session.job} ke liye apply kar rahe hain.`
            : `You're applying for ${session.job}.`)
          : (session.lang === 'hi'
            ? 'Koi si bhi job ho sakti hai — jab apply karein toh bata dein.'
            : 'You can apply for any of our jobs — just tell me which one you prefer.');
        return { reply: current + '\n\n' + R.askName, session };
      }
      const raw = extractFieldAnswer(message, 'name');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidName(raw)) {
        return { reply: rulesFor(session).nameInvalid || RULES.nameInvalid, session };
      }
      session.name = raw;
      session.state = 'awaiting_phone';
      return { reply: rulesFor(session).askPhone, session };
    }

    case 'awaiting_phone': {
      // Side-question (security, job details, knowledge) → answer + re-ask.
      const side = await sideQuestionInField(session, message);
      if (side) return { reply: side, session };
      const raw = extractFieldAnswer(message, 'phone');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidPhone(raw)) {
        return { reply: rulesFor(session).phoneInvalid, session };
      }
      session.phone = raw;
      session.state = 'awaiting_telegram';
      return { reply: rulesFor(session).askTelegram, session };
    }

    case 'awaiting_telegram': {
      // Side-question (security, job details, knowledge) → answer + re-ask.
      const side = await sideQuestionInField(session, message);
      if (side) return { reply: side, session };
      const raw = extractFieldAnswer(message, 'telegram');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidTelegram(raw)) {
        return { reply: rulesFor(session).telegramInvalid, session };
      }
      session.telegram = raw;
      session.state = 'awaiting_confirm';
      const R = rulesFor(session);
      const confirm =
        R.confirmHeader +
        (session.job ? `\n• Job: ${session.job}` : '') +
        `\n• Name: ${session.name}\n• Phone: ${session.phone}\n• Telegram: ${session.telegram}` +
        `\n\n${R.confirmPrompt}`;
      return { reply: confirm, session };
    }

    case 'awaiting_confirm': {
      const lower = text.toLowerCase();

      // Side-question (job details, knowledge, security) → answer + re-ask
      // the confirm prompt, so the pending application isn't lost.
      if (!isYes(text) && !isNo(text)) {
        const side = await sideQuestionInField(session, message);
        if (side) return { reply: side, session };
      }

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

module.exports = {
  processMessage,
  createSession,
  detectLanguage,
  detectSentiment,
  isYes,
  isNo,
  isCancelling,
  asksTelegramHelp,
  asksSecurity,
  matchJob,
};
