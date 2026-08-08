/**
 * Telegram conversation wrapper — drives the guided apply flow for the
 * Telegram bot. The state machine itself lives in services/flow.js; this
 * module only bridges it to the Telegram transport (sessions keyed by chat id
 * and messages delivered via telegram.sendMessage).
 */

const store = require('../store');
const telegram = require('./telegram');
const { createSession, processMessage } = require('./flow');
const { normalizeText } = require('../utils/validation');

/**
 * Handle a single incoming Telegram message for a chat.
 * @returns {Promise<string|null>} the reply that was sent, or null for none
 */
async function handleMessage(chatId, text) {
  const message = normalizeText(text);
  if (!message) return null;

  let session = store.getSession(chatId);
  if (!session) {
    session = createSession();
  }
  store.saveSession(chatId, session);

  const { reply, session: updated } = await processMessage(session, message);
  store.saveSession(chatId, updated);

  await telegram.sendMessage(chatId, reply);
  return reply;
}

module.exports = { handleMessage };
