/**
 * n8n webhook client.
 *
 * Candidate submissions are POSTed to the n8n workflow asynchronously with a
 * retry/backoff policy. A queue is used so that a slow n8n endpoint never
 * blocks the fast conversation flow, and the API always answers immediately
 * (queue-friendly handling, required for 1,000+ chats/day).
 */

const config = require('../config');
const { postJsonWithRetry } = require('../utils/http');
const logger = require('../utils/logger');

/**
 * Fire-and-forget enqueue. Returns immediately; the submission is delivered
 * to n8n in the background with retries.
 */
function enqueueSubmission(payload) {
  const record = { payload, attempts: 0, queuedAt: Date.now() };
  processSubmission(record).catch((err) => {
    logger.error('n8n submission permanently failed', {
      fingerprint: payload.fingerprint,
      err: err.message,
    });
  });
}

async function processSubmission(record) {
  const { payload } = record;
  const headers = {};
  if (config.n8n.webhookSecret) headers['x-webhook-secret'] = config.n8n.webhookSecret;

  try {
    await postJsonWithRetry(config.n8n.webhookUrl, payload, {
      timeoutMs: config.n8n.timeoutMs,
      maxRetries: config.n8n.maxRetries,
      headers,
    });
    logger.info('Candidate submitted to n8n', {
      fingerprint: payload.fingerprint,
      name: payload.name,
    });
    return true;
  } catch (err) {
    logger.error('Candidate submission to n8n failed', {
      fingerprint: payload.fingerprint,
      err: err.message,
    });
    throw err;
  }
}

module.exports = { enqueueSubmission, processSubmission };
