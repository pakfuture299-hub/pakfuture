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
 *   awaiting_interest       → after job interest: pitch (why Discord) +
 *                             tutorial links (app/video) → "want to apply?"
 *   awaiting_apply_decision → yes → collect details; no → polite close
 *   awaiting_name           → collect full name
 *   awaiting_phone          → collect contact number
 *   awaiting_discord        → collect Discord username
 *   awaiting_confirm        → confirm details → submit → team username + done
 *   done                    → soft "already submitted" reply
 *
 * Language: if the candidate writes in Roman Urdu/Hinglish the replies switch
 * to Hinglish (RULES_HI). Detection is deterministic (marker words), never a
 * model decision.
 */

const { classifyIntent, askGrounded } = require('./openai');
const { submitCandidate } = require('./submission');
const { createIntentMatcher } = require('./intents');
const {
  RULES,
  RULES_HI,
  INTENTS,
  SENTIMENTS,
  jobsListReply,
} = require('../knowledge/base');
const {
  isValidName,
  isValidPhone,
  isValidDiscordUsername,
  normalizeText,
  isRedirectTrigger,
} = require('../utils/validation');
const { JOBS } = require('../knowledge/base');
const logger = require('../utils/logger');

const EMPTY_ANSWER_SENTINEL = 'EMPTY_ANSWER';

/** Deterministic matcher over the PDF's 12 intents (longest trigger wins). */
const intentMatcher = createIntentMatcher(INTENTS);

/**
 * Resolve a message to its PDF intent reply, if any. Returns the EXACT PDF
 * script (no appended prompts). Checks intent triggers BEFORE any
 * interest/apply heuristic so "apply kaise karna hai" → INTENT_05, never a
 * job-selection pitch.
 */
function matchPdfIntent(message) {
  const m = intentMatcher.match(message);
  return m ? m.intent.reply : null;
}

/**
 * The PDF intents that are pure knowledge answers — matched deterministically
 * and answered with the EXACT PDF script, with no appended prompts. These are
 * safe to answer in any state. The flow intents (01 welcome, 05 apply,
 * 10 job-selection, 12 confirmation) are handled by the state machine so the
 * guided flow still works.
 */
const KNOWLEDGE_INTENT_IDS = new Set([
  'INTENT_02_AVAILABLE_JOBS',
  'INTENT_03_TRUST_LEGITIMACY',
  'INTENT_04_PAYMENT_GUARANTEE',
  'INTENT_06_JOB_TIMINGS',
  'INTENT_07_OFFICE_LOCATION',
  'INTENT_08_REQUIREMENTS',
  'INTENT_09_REGISTRATION_FEE',
  'INTENT_11_DISCORD_GUIDANCE',
]);

/**
 * Resolve a message to its PDF intent object (not just the reply), so the
 * caller can inspect which intent matched.
 */
function matchPdfIntentObject(message) {
  return intentMatcher.match(message);
}

/** Roman Urdu / Hinglish marker words (lowercase, exact or word-boundary). */
const HI_MARKERS = [
  'haan', 'nahi', 'nai', 'nhi', 'kya', 'karo', 'karein', 'chahiye', 'chahie',
  'aap', 'aapka', 'aapki', 'batao', 'bataiye', 'bhai', 'salam', 'kaam',
  'ji', 'hn', 'hain', 'hai', 'kahan', 'kaise', 'kis', 'mera', 'meri',
  'mujhe', 'main', 'mein', 'me', 'apna', 'apni', 'wala', 'wali', 'shukriya', 'masalan',
  'kar', 'raha', 'rahi', 'karna', 'krna', 'mil', 'deta', 'deti',
  'konsi', 'kaunsi', 'kaun', 'kaun si', 'jobs', 'job', 'hota', 'hoti',
  'karte', 'karti', 'karta', 'bana', 'banna', 'aana', 'aati', 'aata',
  'kisam', 'kism', 'kitni', 'kitna', 'kahan se', 'kab', 'zaroorat',
  'hai kya', 'hain kya', 'interested hu', 'interested hoon',
];

/** Words that look like a "no" answer (Hinglish + English). */
const NO_WORDS = ['nahi', 'nai', 'nhi', 'na', 'no', 'nope', 'nhi hai', 'nahi hai'];
/** Words that look like a "yes" answer (Hinglish + English). */
const YES_WORDS = [
  'haan', 'han', 'hn', 'ji', 'ji haan', 'ji han', 'yes', 'yep', 'yeah',
  'pehle se bana', 'bana hua', 'hai', 'yes hai', 'haan hai',
];
/** Words that explicitly signal interest in a job (Hinglish + English). */
const INTEREST_WORDS = [
  'interested', 'interest', 'apply', 'karna chahta', 'karna chahti',
  'karna chahta hoon', 'karna chahti hoon', 'chahiye', 'chahie',
  'karna hai', 'karni hai', 'join', 'apply karna', 'apply karni',
  'apply karna hai', 'apply karni hai', 'mein interested',
  'main interested', 'me interested', 'mujhe chahiye', 'mujhe ye chahiye',
  'banna chahta', 'banna chahti', 'kaam karna', 'kaam karna hai',
  'shuru karein', 'shuru karo', 'apply karte', 'apply karne',
];

/**
 * Heuristic-only: detect whether the candidate is writing Roman Urdu/Hinglish.
 * Returns 'hi' or 'en'. A strong single marker (haan/nahi/ji) is enough;
 * otherwise two or more markers tip the balance.
 */
function detectLanguage(text) {
  const t = normalizeText(text).toLowerCase();
  const words = t.split(/[^a-z0-9@+]+/).filter(Boolean);

  let hits = 0;
  for (const w of words) {
    if (HI_MARKERS.includes(w)) hits += 1;
  }

  const strong = ['haan', 'nahi', 'nai', 'nhi', 'ji', 'shukriya', 'chahiye', 'kya'];
  if (words.some((w) => strong.includes(w))) return 'hi';
  // "mein/main ... hu/hoon/hain" interest/self phrasing is a strong Hinglish
  // signal even though "interested" alone is English.
  if (/(mein|main|me)\s+(interested|apply|banna|karna)\s+(hu|hoon|hain|hai)/.test(t)) return 'hi';
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
  if (/(which|what|konsi|kaun si|kis) job|job (ke liye|kis)|am i applying|apply kar rah/.test(t)) return false;
  return YES_WORDS.some((w) => new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(t));
}

/** True when the message looks like a plain "no" answer. */
function isNo(text) {
  const t = normalizeText(text).toLowerCase();
  return NO_WORDS.some((w) => new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(t));
}

/**
 * True when the message is an explicit interest in applying — "i am
 * interested", "i want to apply", "mein interested hu", "main apply karna
 * chahta hoon" etc. Checked in EVERY state (idle, after a job answer, even
 * mid field collection) so an interest statement is never mistaken for a
 * name / phone / discord username.
 */
function isInterested(text) {
  const t = normalizeText(text).toLowerCase();
  if (/^(\s|\b)*(yes|haan|han|hn|ji|yeah|yep|ok|okay|sure|theek hai|thik hai)(\s|\b|$)*$/.test(t)) return false;
  if (isNo(t)) return false;
  if (/(no |nahi |nai |nhi )+(thank|thanks|shukriya)/.test(t)) return false;
  if (/(i am|i'm|im|mein|main|mujhe|mujhy|hum|we)\s+(not|nahi|nai|nhi)/.test(t)) return false;
  // A question is never an interest statement — "qualification chahiye?",
  // "kaam karna hai?", "kitni salary chahiye" are intent questions, not
  // interest. The deterministic PDF matcher already handled exact triggers;
  // this is only for genuine apply/interest phrasings not in the PDF.
  if (/(\?$)|(^|\s)(kya|konsi|kaun si|which|what|how|where|when|why|is|are|do|does|can|batao|bataiye|bataye|kitni|kitna|kia|hai kya)\b/i.test(t)) return false;
  // Require a self-directed apply/interest phrase — not a bare word.
  return (
    /(i am|i'm|im|mein|main|me|hum|we|mujhe|mujhy|haan|yes)\s+(interested|apply|join|banna|karna|chahata|chahti|chahunga|chahungi)/.test(t) ||
    /(interested|apply|join)\s+(in|for|karna|karne|karte|karti)/.test(t) ||
    /^(interested|apply|join|banna chahta|banna chahti|kaam karna chahta|kaam karna chahti)\b/.test(t) ||
    /(apply karna|apply karni|apply karne|apply karte|apply karti)\b/.test(t) ||
    /(mujhe|mujhy|main|mein|hum|we)\s+(yeh|ye|is|job|kaam)\s+(chahiye|chahie|karna|karni)/.test(t)
  );
}

/**
 * True when the candidate is asking for a list of available jobs — "konsi
 * jobs hain", "which jobs are available", "jobs list" etc. Handled
 * deterministically so the model can never mislabel it and the list is
 * always complete.
 */
function isAskingJobList(text) {
  const t = normalizeText(text).toLowerCase();
  return (
    /(konsi|kaunsi|kaun si|kitni|what|which)\s+(jobs|job|skills|skills jobs|jobs available|jobs hain|jobs ho)\b/.test(t) ||
    /(jobs|job)\s+(available|hain|ho sakti|mil sakti|hain kya|available hain)\b/.test(t) ||
    /^(jobs|job)( list| list?|s?)$/.test(t) ||
    /list\s+(of\s+)?(jobs|job|available jobs|jobs available)/.test(t) ||
    /(jobs|job)\s+list/.test(t)
  );
}

/**
 * True when a message clearly is NOT a personal-details answer while a field
 * is being collected — greetings, yes/no, sentiments, question words, small
 * talk. Such a message must never be stored as a name / phone / discord.
 * Returns true for "hi", "yes", "no", "ok", "how are you", "what?", etc.
 */
function isFieldNonAnswer(text) {
  const t = normalizeText(text).toLowerCase();
  if (/^(\s|\b)*(hi|hello|hey|salam|salaam|assalam|assalamo|assalamualaikum|salam alaikum|good morning|good afternoon|good evening|good night)(\s|\b|$)*/.test(t)) return true;
  if (/^(\s|\b)*(yes|yep|yeah|no|nope|na|nahi|nai|nhi|haan|han|hn|ji|ok|okay|oki|sure|alright|fine|theek hai|thik hai|chalo|go ahead)(\s|\b|$)*$/.test(t)) return true;
  if (detectSentiment(text)) return true;
  if (/(\?$)|(^|\s)(kya|konsi|kaun si|which|what|how|where|when|why|is|are|do|does|can|tell|batao|bataiye|bataye)\b/i.test(t)) return true;
  if (isInterested(text)) return true;
  if (isAskingJobList(text)) return true;
  return false;
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
 * True when the candidate is asking about Discord setup / says they don't
 * have Discord — checked deterministically so a misclassified help request
 * during the flow still gets the setup guide instead of a validation error.
 */
function asksDiscordHelp(text) {
  const t = normalizeText(text).toLowerCase();
  return /(discord (nahi|nhi|how|kya|install|download|setup|banao|banana|kaise|kya hai|aata|aati)|nahi (hai|pata).*discord|nhi (hai|pata).*discord|discord.*(nahi|nhi)|how (to )?(install|use|join|make|create).*discord|discord account|make discord|create discord|discord kya hai|discord kaise|discord account nahi)/.test(t);
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
 * A friendly answer when a candidate asks about a specific job. The PDF's
 * INTENT_10 (Job Selection & Discord Transition) is the only per-job
 * response script it defines, so a job question is answered with that intent
 * + the full jobs list (so the candidate sees the options).
 */
function jobSummary(job) {
  return INTENTS[9].reply + '\n\n' + jobsListReply();
}

/** Build a fresh session. */
function createSession() {
  return {
    state: 'idle',
    lang: 'en',
    name: null,
    phone: null,
    discord: null,
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
    case 'awaiting_discord': return R.askDiscord;
    case 'awaiting_confirm': return R.confirmPrompt;
    default: return null;
  }
}

/** The Discord setup guide — INTENT_11 verbatim from the PDF. */
function discordHelpReply(session) {
  return INTENTS[10].reply;
}

/**
 * Greeting reply — the EXACT INTENT_01 PDF script (welcome message). No extra
 * emoji, no extra prompts: only what the PDF specifies.
 */
function shortGreetingReply(session) {
  return INTENTS[0].reply;
}

/**
 * The interest → pitch step: INTENT_10's exact PDF script (why Discord, the
 * WhatsApp comparison, account-setup question) followed by the apply
 * decision question. No extra ack, no extra prompts — only the PDF script +
 * the flow's apply question.
 */
function pitchAndAskReply(session) {
  const R = rulesFor(session);
  return INTENTS[9].reply + '\n\n' + R.applyAsk;
}

/** Polite close when the candidate is not interested in applying. */
function notInterestedReply(session) {
  return rulesFor(session).notInterested;
}

/** Final reply after a successful submission: team contact username + confirmation. */
function submittedReply(session) {
  const R = rulesFor(session);
  return (
    R.submitted +
    '\n\n' +
    R.teamContactLine
  );
}

/** Validate + extract a field answer from free text. */
function extractFieldAnswer(message, field) {
  const s = normalizeText(message);
  if (!s || s.length > 120) return EMPTY_ANSWER_SENTINEL;
  return s;
}

/**
 * Handle a side-question (job details, knowledge, security, discord help)
 * that arrives mid field-collection: answer it, then re-ask the field so the
 * application flow is never lost. Returns null when the message isn't a
 * side-question (i.e. it's a real field answer or invalid input).
 */
async function sideQuestionInField(session, message) {
  if (isInterested(message)) return null; // "i'm interested" mid-field → handled by state
  if (asksSecurity(message)) {
    // PDF-exact trust answer (INTENT_03), then re-ask the field.
    return INTENTS[2].reply + '\n\n' + fieldReask(session);
  }
  if (asksDiscordHelp(message)) {
    return discordHelpReply(session) + '\n\n' + fieldReask(session);
  }
  // Job names ("what is data entry?") and knowledge questions ("how much can
  // i earn?") are answered from the knowledge base.
  if (namesJob(message) || asksKnowledgeQuestion(message) || looksLikeQuestion(message)) {
    const answer = await answerQuestion(session, message);
    if (answer === null) return null;
    if (answer.applyFlow) return null; // "i want to apply" — handled by state
    if (answer.discordHelp) return discordHelpReply(session) + '\n\n' + fieldReask(session);
    return answer + '\n\n' + fieldReask(session);
  }
  return null;
}

/**
 * Build a grounded answer about a job (or general knowledge) and attach the
 * matched job to the session. Answers ONLY from the PDF intents — the exact
 * script, never model-generated text. Returns the reply string, an
 * { applyFlow } / { discordHelp } sentinel, or null when out of scope.
 */
async function answerQuestion(session, message) {
  // Deterministic PDF intent match first — the PDF's trigger keywords are the
  // only source of answers. Returns the EXACT script.
  const pdfMatch = matchPdfIntentObject(message);
  if (pdfMatch) {
    // Track a job named in the message when it's a job-selection intent.
    if (pdfMatch.intent.id === 'INTENT_10_JOB_SELECTION') {
      const m = matchJob(message);
      if (m) session.job = m.name;
      return pdfMatch.intent.reply;
    }
    if (pdfMatch.intent.id === 'INTENT_05_DIRECT_APPLY') return { applyFlow: true };
    if (pdfMatch.intent.id === 'INTENT_11_DISCORD_GUIDANCE') return { discordHelp: true };
    return pdfMatch.intent.reply;
  }
  // Deterministic "which jobs are available?" (INTENT_02) — never rely on the model.
  if (isAskingJobList(message)) {
    return jobsListReply(session.lang);
  }
  // Nothing in the PDF matches → out of scope. Never improvise.
  return null;
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

  // A completed applicant who writes again resets to a fresh conversation —
  // this must run BEFORE the deterministic intent dispatch so a greeting or
  // question after submission is treated as a new conversation, not answered
  // in the done state. Submission-level duplicate detection still protects
  // the sheet if they re-apply with the same details.
  if (session.state === 'done') {
    session.state = 'idle';
    return processMessage(session, message);
  }

  // Deterministic PDF intent match — runs FIRST so every trigger keyword in
  // the PDF gets its EXACT answer, never a heuristic misclassification.
  // ALL 12 intents resolve here; knowledge intents answer the exact script in
  // any state, flow intents transition the guided flow. In a field-collection
  // state a knowledge answer appends the field re-ask so the application is
  // never lost.
  const pdfMatch = matchPdfIntentObject(text);
  if (pdfMatch && KNOWLEDGE_INTENT_IDS.has(pdfMatch.intent.id)) {
    const reask = fieldReask(session);
    return {
      reply: reask ? pdfMatch.intent.reply + '\n\n' + reask : pdfMatch.intent.reply,
      session,
    };
  }
  // INTENT_01 (Welcome) — "hi", "hello", "salam", "info", "start", "details".
  // Reply with the EXACT PDF welcome script. In a field-collection state the
  // field is re-asked so the application is never lost.
  if (pdfMatch && pdfMatch.intent.id === 'INTENT_01_WELCOME') {
    const reask = fieldReask(session);
    return {
      reply: reask ? pdfMatch.intent.reply + '\n\n' + reask : pdfMatch.intent.reply,
      session,
    };
  }
  // INTENT_05 (Direct Job Application) — "apply kaise karna hai", "job
  // chahiye", "hiring process" etc. Must reply with the EXACT PDF script, not
  // the INTENT_10 selection pitch. The candidate is then asked to pick a job.
  // In a field-collection state, answer + re-ask the field.
  if (pdfMatch && pdfMatch.intent.id === 'INTENT_05_DIRECT_APPLY') {
    const reask = fieldReask(session);
    if (reask) {
      return { reply: pdfMatch.intent.reply + '\n\n' + reask, session };
    }
    session.state = 'awaiting_interest';
    return { reply: pdfMatch.intent.reply, session };
  }
  // INTENT_12 (Discord Setup Confirmation) — "discord account done" etc.
  // The candidate finished setup: hand over the exact PDF script (team username).
  if (pdfMatch && pdfMatch.intent.id === 'INTENT_12_DISCORD_CONFIRMATION') {
    return { reply: pdfMatch.intent.reply, session };
  }
  // SECURITY / TRUST questions take priority over a job-name match: "is data
  // entry safe?", "data kahan jayegi", "trust kaise karein". Answered with the
  // PDF's INTENT_03 trust script; the field re-ask keeps the application alive.
  if (asksSecurity(text)) {
    const reask = fieldReask(session);
    return { reply: reask ? INTENTS[2].reply + '\n\n' + reask : INTENTS[2].reply, session };
  }
  // INTENT_10 (Job Selection & Discord Transition) — the candidate picks a
  // job ("data entry", "graphic designer", "yeh job chahiye", "is mein
  // interested hoon"). Reply with the EXACT PDF script (which explains the
  // Discord transition), capture the chosen job, and move the flow to the
  // apply decision. In a field-collection state, answer + re-ask the field so
  // the application is never lost.
  if (pdfMatch && pdfMatch.intent.id === 'INTENT_10_JOB_SELECTION') {
    const matched = matchJob(text);
    if (matched) session.job = matched.name;
    const reask = fieldReask(session);
    if (reask) {
      return { reply: pdfMatch.intent.reply + '\n\n' + reask, session };
    }
    session.state = 'awaiting_apply_decision';
    return { reply: pdfMatch.intent.reply, session };
  }

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

  // Language detection — re-run on every message so a candidate who switches
  // from English to Roman Urdu/Hinglish mid-conversation gets replies in the
  // language they are actually writing. A session only flips to 'en' when the
  // current message is clearly English (strong-en marker), and only flips to
  // 'hi' on strong Hinglish markers — so one stray English word doesn't flip
  // a Hinglish session back and forth. Runs in EVERY state, including field
  // collection, so a name or phone typed in Roman Urdu doesn't switch the
  // bot mid-application. It must run BEFORE the universal guards below so a
  // Hinglish "mein interested hu" gets a Hinglish pitch.
  {
    const lang = detectLanguage(text);
    if (lang === 'hi') {
      session.lang = 'hi';
    } else if (lang === 'en' && isStrongEnglish(text)) {
      session.lang = 'en';
    }
  }

  // Universal "which jobs are available?" — the list is answered
  // deterministically from the knowledge base at ANY point in the flow, and
  // the current field (if any) is re-asked so the application is never lost.
  // The reply is INTENT_02's EXACT PDF script — nothing appended outside a
  // field-collection state.
  if (isAskingJobList(text)) {
    if (['awaiting_name', 'awaiting_phone', 'awaiting_discord', 'awaiting_confirm'].includes(session.state)) {
      return { reply: jobsListReply(session.lang) + '\n\n' + fieldReask(session), session };
    }
    if (session.state === 'awaiting_apply_decision') {
      return { reply: jobsListReply(session.lang), session };
    }
    session.state = 'awaiting_interest';
    return { reply: jobsListReply(session.lang), session };
  }

  // Universal "i am interested" — an explicit interest statement at ANY point
  // (even mid field collection or at the confirm step) moves the flow to the
  // pitch, and the chosen job is captured when the statement names one. The
  // one state where this is skipped is awaiting_apply_decision, which already
  // asks a yes/no question and consumes the answer itself.
  if (isInterested(text) && session.state !== 'awaiting_apply_decision') {
    const matched = matchJob(text);
    if (matched) session.job = matched.name;
    session.state = 'awaiting_apply_decision';
    return { reply: pitchAndAskReply(session), session };
  }

  // Universal Discord-help fallback — checked before the model so a
  // misclassified "discord nahi pata" during the flow never lands in a
  // validation-error loop.
  if (asksDiscordHelp(text)) {
    return { reply: discordHelpReply(session), session };
  }

  // Universal security-reassurance fallback — a candidate who raises a
  // privacy/trust concern at ANY point gets the PDF's INTENT_03 trust answer.
  // In a field-collection state we append the field re-ask so the flow continues.
  if (asksSecurity(text)) {
    const reask = fieldReask(session);
    return { reply: reask ? INTENTS[2].reply + '\n\n' + reask : INTENTS[2].reply, session };
  }

  // In field-collection states, a back-out ("no thanks", "no, cancel",
  // "no stop", "nahi") must beat the sentiment handler, which would otherwise
  // reply "you're welcome" and keep asking for the field forever. A bare
  // "no problem" / "no worries" (dismissive, not a refusal) does NOT close.
  if (
    isNo(text) &&
    !/(no (problem|worries|issue|prob|thanks to you))/.test(text) &&
    ['awaiting_name', 'awaiting_phone', 'awaiting_discord', 'awaiting_confirm'].includes(session.state)
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

  // Re-route Discord help requests at any point in the flow.
  const intent = await classifyIntent(text);
  if (intent.discordHelpRequested || intent.intent === 'discord_help') {
    return { reply: discordHelpReply(session), session };
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
          } else if (answer.discordHelp) {
            reply = discordHelpReply(session);
          } else {
            // EXACT PDF script — nothing appended.
            reply = answer;
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
        } else if (answer.discordHelp) {
          reply = discordHelpReply(session);
        } else {
          // EXACT PDF script — nothing appended.
          reply = answer;
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
        } else if (answer.discordHelp) {
          reply = discordHelpReply(session);
        } else {
          // EXACT PDF script — nothing appended.
          reply = answer;
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
        if (answer.discordHelp) return { reply: discordHelpReply(session), session };
        return { reply: answer, session };
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
        if (answer.discordHelp) return { reply: discordHelpReply(session), session };
        // EXACT PDF script — nothing appended.
        return { reply: answer, session };
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
        // Capture a job named in the answer ("yes, apply for data entry").
        const matchedJob = matchJob(text);
        if (matchedJob) session.job = matchedJob.name;
        // "yes" while the candidate has just shown interest in a specific job
        // ("i am interested in data entry") — keep the pitch, don't skip it.
        if (session.job && /interest|interested/.test(text)) {
          return { reply: pitchAndAskReply(session), session };
        }
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
        if (answer.discordHelp) return { reply: discordHelpReply(session), session };
        return { reply: answer, session };
      }
      // A follow-up question while waiting for yes/no ("konsi jobs hain?")
      // should be answered, not absorbed into the pitch or repeated ask.
      if (intent.intent === 'provide_info' || looksLikeQuestion(text)) {
        const answer = await answerQuestion(session, message);
        if (answer === null) return { reply: rulesFor(session).outOfScopeRedirect, session };
        if (answer.applyFlow) return { reply: pitchAndAskReply(session), session };
        if (answer.discordHelp) return { reply: discordHelpReply(session), session };
        // EXACT PDF script — nothing appended.
        return { reply: answer, session };
      }
      // A candidate may skip the "yes" and go straight to their name — accept
      // a valid-looking name and continue the flow.
      if (isValidName(text)) {
        session.name = text;
        session.state = 'awaiting_phone';
        return { reply: rulesFor(session).askPhone, session };
      }
      return { reply: rulesFor(session).applyAsk, session };
    }

    case 'awaiting_name': {
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
      // Never store a greeting, yes/no, sentiment, or question as a name.
      if (isFieldNonAnswer(text)) {
        const R = rulesFor(session);
        return { reply: R.nameInvalid || RULES.nameInvalid, session };
      }
      // A side-question (security concern, job details, knowledge question)
      // mid-application: answer it and re-ask for the name.
      const side = await sideQuestionInField(session, message);
      if (side) return { reply: side, session };
      const raw = extractFieldAnswer(message, 'name');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidName(raw)) {
        return { reply: rulesFor(session).nameInvalid || RULES.nameInvalid, session };
      }
      session.name = raw;
      session.state = 'awaiting_phone';
      return { reply: rulesFor(session).askPhone, session };
    }

    case 'awaiting_phone': {
      // The candidate may name a job instead of a number — capture it and
      // keep asking for the phone.
      const matchedJob = matchJob(text);
      if (matchedJob) {
        session.job = matchedJob.name;
        const ack = session.lang === 'hi'
          ? `Theek hai — ${matchedJob.name} ke liye apply! 👍`
          : `Got it — applying for ${matchedJob.name}! 👍`;
        return { reply: ack + '\n\n' + rulesFor(session).askPhone, session };
      }
      // Never store a greeting, yes/no, sentiment, or question as a phone.
      if (isFieldNonAnswer(text)) {
        return { reply: rulesFor(session).phoneInvalid, session };
      }
      // Side-question (security, job details, knowledge) → answer + re-ask.
      const side = await sideQuestionInField(session, message);
      if (side) return { reply: side, session };
      const raw = extractFieldAnswer(message, 'phone');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidPhone(raw)) {
        return { reply: rulesFor(session).phoneInvalid, session };
      }
      session.phone = raw;
      session.state = 'awaiting_discord';
      return { reply: rulesFor(session).askDiscord, session };
    }

    case 'awaiting_discord': {
      // The candidate may name a job instead of a Discord username — capture
      // it and keep asking for the Discord username.
      const matchedJob = matchJob(text);
      if (matchedJob) {
        session.job = matchedJob.name;
        const ack = session.lang === 'hi'
          ? `Theek hai — ${matchedJob.name} ke liye apply! 👍`
          : `Got it — applying for ${matchedJob.name}! 👍`;
        return { reply: ack + '\n\n' + rulesFor(session).askDiscord, session };
      }
      // Never store a greeting, yes/no, sentiment, or question as a Discord id.
      if (isFieldNonAnswer(text)) {
        return { reply: rulesFor(session).discordInvalid, session };
      }
      // Side-question (security, job details, knowledge) → answer + re-ask.
      const side = await sideQuestionInField(session, message);
      if (side) return { reply: side, session };
      const raw = extractFieldAnswer(message, 'discord');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidDiscordUsername(raw)) {
        return { reply: rulesFor(session).discordInvalid, session };
      }
      session.discord = raw;
      session.state = 'awaiting_confirm';
      const R = rulesFor(session);
      const confirm =
        R.confirmHeader +
        (session.job ? `\n• Job: ${session.job}` : '') +
        `\n• Name: ${session.name}\n• Phone: ${session.phone}\n• Discord: ${session.discord}` +
        `\n\n${R.confirmPrompt}`;
      return { reply: confirm, session };
    }

    case 'awaiting_confirm': {
      const lower = text.toLowerCase();

      // The candidate may name a job to change their choice — capture it and
      // keep the confirm prompt (a job name is never a confirm answer).
      const matchedJob = matchJob(text);
      if (matchedJob) {
        session.job = matchedJob.name;
        const ack = session.lang === 'hi'
          ? `Theek hai — ${matchedJob.name} ke liye apply! 👍`
          : `Got it — applying for ${matchedJob.name}! 👍`;
        const R = rulesFor(session);
        return {
          reply:
            ack +
            '\n\n' +
            R.confirmHeader +
            `\n• Job: ${session.job}\n• Name: ${session.name}\n• Phone: ${session.phone}\n• Discord: ${session.discord}` +
            `\n\n${R.confirmPrompt}`,
          session,
        };
      }

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
      if (/discord/i.test(lower)) {
        session.discord = null;
        session.state = 'awaiting_discord';
        return { reply: rulesFor(session).askDiscord, session };
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
  isInterested,
  isAskingJobList,
  isCancelling,
  asksDiscordHelp,
  asksSecurity,
  matchJob,
};
