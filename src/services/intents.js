/**
 * Deterministic intent matcher built from the client's
 * Job_Portal_Bot_System_Architecture.pdf.
 *
 * The PDF defines 12 intents, each with trigger keywords and an EXACT
 * response script. This module matches a candidate's message against those
 * trigger keywords (lowercased, whitespace-collapsed) and returns the
 * matching intent's script VERBATIM — nothing added, nothing removed.
 *
 * Priority rules:
 *  - Longest trigger match wins (so "apply kaise karein" hits INTENT_05's
 *    trigger, never a shorter substring of another intent).
 *  - The matcher is checked BEFORE any interest/apply heuristic in flow.js,
 *    so a direct question like "apply kaise karna hai" always gets its PDF
 *    answer (INTENT_05) instead of being mistaken for a job selection.
 *
 * Emoji normalization: the PDF writes emojis with/without variation
 * selectors; strip those so matching is stable.
 */

/**
 * Normalize a message for keyword matching: lowercase, collapse
 * whitespace/punctuation runs to single spaces, trim, drop variation
 * selectors.
 */
function normalizeKeywords(input) {
  if (typeof input !== 'string') return '';
  return input
    .toLowerCase()
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/[^a-z0-9@+.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whole-word keyword layer: a single distinctive keyword used anywhere in a
 * sentence ("fees?", "salary kya hai", "timing batao") resolves to its
 * intent even when it is not inside one of the PDF's exact trigger phrases.
 *
 * This runs ONLY after the phrase layer found no match, so existing exact
 * trigger behaviour is completely unchanged. Keywords are chosen to be
 * unambiguous whole words — generic words like "job"/"kaam" are deliberately
 * excluded to avoid false positives.
 */
const KEYWORD_INTENTS = [
  { keywords: ['fees', 'fee', 'registration charge'], intentId: 'INTENT_09_REGISTRATION_FEE' },
  { keywords: ['salary', 'payout', 'payment', 'easypaisa', 'jazzcash', 'income', 'earn'], intentId: 'INTENT_04_PAYMENT_GUARANTEE' },
  { keywords: ['timing', 'timings', 'hours', 'ghante'], intentId: 'INTENT_06_JOB_TIMINGS' },
  { keywords: ['office', 'location', 'address'], intentId: 'INTENT_07_OFFICE_LOCATION' },
  { keywords: ['qualification', 'qualifications', 'experience', 'age limit', 'parhai', 'padhai'], intentId: 'INTENT_08_REQUIREMENTS' },
  { keywords: ['scam', 'trust', 'legit', 'fake', 'safe', 'secure', 'trusted'], intentId: 'INTENT_03_TRUST_LEGITIMACY' },
  { keywords: ['vacancies', 'jobs list', 'available jobs'], intentId: 'INTENT_02_AVAILABLE_JOBS' },
  // NOTE: flow intents (apply / job-selection / telegram confirmation) are
  // deliberately NOT in the keyword layer — the guided apply flow handles
  // those, and a bare keyword must never hijack it.
];

/** True when the message contains the keyword as a whole word. */
function hasWholeWord(message, keyword) {
  return message.search(new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`)) !== -1;
}

/** Build a lookup: keyword -> intent object. */
function buildKeywordLookup(intents) {
  const byId = new Map(intents.map((i) => [i.id, i]));
  const kw = [];
  for (const { keywords, intentId } of KEYWORD_INTENTS) {
    const intent = byId.get(intentId);
    if (!intent) continue;
    for (const k of keywords) {
      const key = normalizeKeywords(k);
      if (!key) continue;
      kw.push({ key, intent });
    }
  }
  // Longest keyword first (e.g. "registration charge" before "fees").
  kw.sort((a, b) => b.key.length - a.key.length);
  return kw;
}

/** Escape a string for use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a message against a trigger phrase with WORD-BOUNDARY semantics:
 * the trigger must appear as whole words, not as a substring inside a longer
 * word. "hi" must NOT match inside "nahi"/"chahiye"; "data entry" must not
 * match inside "metadata entrypoint". A match is a run of the trigger's words
 * separated by single spaces, bounded by non-word characters (or string
 * edges) on both sides.
 */
function triggerMatches(message, key) {
  const escaped = key.split(' ').map(escapeRegExp).join('\\s+');
  // Lookbehind/lookahead: not preceded/followed by a word char (a-z0-9).
  // On older Node, use a manual boundary check instead of lookbehind.
  const idx = message.search(new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`));
  return idx !== -1;
}

/** Build a lookup: trigger phrase -> intent object, with per-intent trigger arrays. */
function buildMatcher(intents) {
  const triggers = [];
  for (const intent of intents) {
    for (const raw of intent.triggers || []) {
      const key = normalizeKeywords(raw);
      if (!key) continue;
      triggers.push({ key, intent });
    }
  }
  // Longest trigger first — a message that matches multiple triggers
  // resolves to the most specific (longest) one.
  triggers.sort((a, b) => b.key.length - a.key.length);
  return triggers;
}

/** Build a matcher from the PDF intents. */
function createIntentMatcher(intents) {
  const triggers = buildMatcher(intents);
  const keywordLookup = buildKeywordLookup(intents);
  return {
    /**
     * Match a message to an intent. Phrase triggers are tried first (longest
     * match wins, unchanged behaviour); if none match, whole-word keywords
     * are tried so a single trigger word used loosely in a sentence still
     * resolves to its intent.
     * @returns {{intent: object, trigger: string}|null} the matched intent
     *   (with its exact reply) or null when nothing matches.
     */
    match(message) {
      const t = normalizeKeywords(message);
      if (!t) return null;
      // Phrase layer (exact trigger phrases, word-boundary).
      for (const { key, intent } of triggers) {
        if (triggerMatches(t, key)) {
          return { intent, trigger: key };
        }
      }
      // Keyword layer (whole-word single keywords used loosely).
      for (const { key, intent } of keywordLookup) {
        if (hasWholeWord(t, key)) {
          return { intent, trigger: key };
        }
      }
      return null;
    },
  };
}

module.exports = { createIntentMatcher, normalizeKeywords, triggerMatches, hasWholeWord, KEYWORD_INTENTS };
