/**
 * Storefront chat engine — powers the chat widget embedded on the Shopify
 * site.
 *
 * The widget is stateless from the browser's perspective but sends a client
 * session id with every message; this module loads/saves the conversation
 * session keyed by that id and delegates to the guided flow (services/flow.js).
 *
 * Legacy behavior: a message with no sessionId gets a single stateless reply
 * (used by older widget versions / tests).
 */

const store = require('../store');
const { createSession, processMessage } = require('./flow');
const { normalizeText } = require('../utils/validation');
const { REDIRECT_GUARDRAIL } = require('../knowledge/base');

/** Never hand the widget a falsy reply — fall back to a safe redirect. */
function safeReply(reply) {
  return typeof reply === 'string' && reply.trim() ? reply : REDIRECT_GUARDRAIL.message;
}

/**
 * Turn a single visitor message into a reply string.
 * @param {string} message the visitor's message
 * @param {string} [sessionId] client-generated conversation id
 * @returns {Promise<{reply: string, sessionId?: string, submitted?: boolean}>}
 */
async function getReply(message, sessionId) {
  const text = normalizeText(message);

  // Stateless mode (no session id): keep the old single-reply behavior.
  if (!sessionId) {
    const { reply } = await processMessage(createSession(), text || 'hello');
    return { reply: safeReply(reply) };
  }

  let session = store.getSession(`widget:${sessionId}`);
  if (!session) {
    session = createSession();
  }

  const { reply, session: updated, submitted } = await processMessage(session, text || 'hello');
  store.saveSession(`widget:${sessionId}`, updated);

  return { reply: safeReply(reply), sessionId, submitted };
}

module.exports = { getReply };
