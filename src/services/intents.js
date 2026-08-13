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
  return {
    /**
     * Match a message to an intent by its trigger keywords.
     * @returns {{intent: object, trigger: string}|null} the matched intent
     *   (with its exact reply) or null when nothing matches.
     */
    match(message) {
      const t = normalizeKeywords(message);
      if (!t) return null;
      for (const { key, intent } of triggers) {
        if (t.includes(key)) {
          return { intent, trigger: key };
        }
      }
      return null;
    },
  };
}

module.exports = { createIntentMatcher, normalizeKeywords };
