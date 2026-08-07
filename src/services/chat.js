/**
 * Storefront chat engine — powers the chat widget embedded on the Shopify site.
 *
 * Unlike the old Telegram flow, this has no session state machine: every
 * message gets a reply immediately. The AI decides what the visitor means
 * (intent), and this module maps each intent to the action that serves the
 * business goal — handing out the single Telegram invite link.
 */

const config = require('../config');
const { classifyIntent, askGrounded } = require('./openai');
const { STORE } = require('../knowledge/base');
const { isRedirectTrigger, normalizeText } = require('../utils/validation');

/** Short, friendly reply that hands the visitor the Telegram invite link. */
function linkReply() {
  return (
    `🎉 Great — you're one step away! Join our team on Telegram: ${config.inviteLink}\n\n` +
    `Our hiring team is active there and will help you get started. See you inside! 👋`
  );
}

/** Answer for anything outside the jobs/recruitment knowledge base. */
function outOfScopeReply() {
  return (
    `I can only help with our online jobs and applications. 💼\n` +
    `For anything else, please visit our website: ${STORE.url}\n\n` +
    `To apply for a job, join us on Telegram: ${config.inviteLink}`
  );
}

/** The canned opening the widget shows before the visitor types anything. */
function welcomeReply() {
  return (
    `👋 Hi! Welcome to ${STORE.name}.\n\n` +
    `We hire daily for online work-from-home jobs 💼. ` +
    `Ask me anything about the jobs, or join our Telegram to apply right away:\n` +
    `${config.inviteLink}`
  );
}

/**
 * Turn a single visitor message into a reply string.
 * Never throws — falls back to a safe redirect on any AI failure.
 */
async function getReply(message) {
  const text = normalizeText(message);
  if (!text) return welcomeReply();

  // Cheap offline guardrail first (no AI call needed for obvious off-topic).
  if (isRedirectTrigger(text)) return outOfScopeReply();

  const intent = await classifyIntent(text);

  if (intent.telegramHelpRequested || intent.intent === 'telegram_help') {
    return linkReply();
  }

  switch (intent.intent) {
    case 'greeting':
      return welcomeReply();
    case 'apply':
      return linkReply();
    case 'provide_info': {
      const answer = await askGrounded(text);
      if (answer.outOfScope) return outOfScopeReply();
      if (answer.applyFlow) return linkReply();
      if (answer.telegramHelp) return linkReply();
      // Real knowledge answer, then nudge toward Telegram.
      return `${answer.text}\n\nWant to get started? Join us on Telegram: ${config.inviteLink}`;
    }
    default:
      return outOfScopeReply();
  }
}

module.exports = { getReply, welcomeReply, linkReply, outOfScopeReply };
