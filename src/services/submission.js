/**
 * Candidate submission service.
 *
 * Owns the "don't lose data" guarantees:
 *  - duplicate detection (same phone / telegram blocked within cooldown),
 *  - canonical field normalisation,
 *  - the exact payload contract expected by the n8n workflow,
 *  - async delivery to n8n (queue-friendly, never blocks the response).
 */

const { enqueueSubmission } = require('./n8n');
const { RULES, STORE } = require('../knowledge/base');
const {
  normalizePhone,
  normalizeTelegram,
  candidateFingerprint,
} = require('../utils/validation');
const store = require('../store');
const logger = require('../utils/logger');

/**
 * Build the payload and hand it to the n8n webhook.
 * Returns one of:
 *   { ok: true, duplicate: false }                       — queued for delivery
 *   { ok: false, duplicate: true }                       — already applied
 */
function submitCandidate({ name, phone, telegram }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedTelegram = normalizeTelegram(telegram);
  const fingerprint = candidateFingerprint(normalizedPhone, normalizedTelegram);

  if (fingerprint && store.isDuplicate(fingerprint)) {
    logger.info('Duplicate submission blocked', { fingerprint });
    return { ok: false, duplicate: true };
  }

  const payload = {
    name,
    phone: normalizedPhone,
    telegram: normalizedTelegram,
    timestamp: new Date().toISOString(),
    source: STORE.name,
  };

  enqueueSubmission(payload);

  if (fingerprint) {
    store.markDuplicate(fingerprint);
  }

  logger.info('Candidate accepted', {
    fingerprint,
    name,
  });

  return { ok: true, duplicate: false, payload };
}

module.exports = { submitCandidate, RULES };
