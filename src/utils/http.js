/**
 * HTTP helpers: a small POST client with retry + exponential backoff, and a
 * timeout wrapper used to enforce the n8n and OpenAI latency budgets.
 *
 * Node 18+ ships global `fetch`, so no axios/undici dependency is needed.
 */

const config = require('../config');
const logger = require('./logger');

/**
 * POST JSON to `url` with retries and exponential backoff.
 * Resolves with the parsed response body; throws a RetryableHttpError when
 * the server responds 5xx, 429 or the request times out, and a plain Error
 * otherwise (4xx — retrying will not help).
 */
async function postJsonWithRetry(url, body, { timeoutMs, maxRetries, headers = {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await withTimeout(fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }), timeoutMs);

      const text = await res.text();
      if (res.ok) {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return { raw: text };
        }
      }
      const isRetryable = res.status === 429 || res.status >= 500;
      const err = new Error(`POST ${url} failed: ${res.status} ${text.slice(0, 200)}`);
      err.status = res.status;
      err.retryable = isRetryable;
      if (!isRetryable) throw err;
      lastError = err;
    } catch (err) {
      // Timeout or network error — retryable.
      err.retryable = err.retryable !== false;
      lastError = err;
    }

    const delay = Math.min(200 * 2 ** (attempt - 1), 4000) + Math.floor(Math.random() * 100);
    logger.warn(`Retrying POST ${url} (attempt ${attempt}/${maxRetries})`, {
      err: lastError.message,
      delayMs: delay,
    });
    await sleep(delay);
  }
  throw lastError;
}

/**
 * Reject with a TimeoutError when the promise does not settle in time.
 */
async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`Request timed out after ${ms}ms`);
          err.code = 'ETIMEDOUT';
          reject(err);
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { postJsonWithRetry, withTimeout, sleep };
