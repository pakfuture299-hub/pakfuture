/**
 * Conversation engine — the state machine that drives the chatbot.
 *
 * Candidate states:
 *   idle            → greeting shown, waiting for anything
 *   awaiting_name   → collecting Full Name
 *   awaiting_phone  → collecting Contact Number
 *   awaiting_telegram → collecting Telegram username or number
 *   awaiting_confirm → confirming details before submission
 *   done            → application submitted; extra messages get a soft reply
 *
 * The model decides *what* the user meant (intent) while this module decides
 * *how* the conversation should react — validation, confirmations, and the
 * knowledge-guardrail redirect are hard-coded rules, never model decisions.
 */

const store = require('../store');
const telegram = require('./telegram');
const { classifyIntent, askGrounded } = require('./openai');
const { submitCandidate } = require('./submission');
const { RULES, TELEGRAM_HELP, STORE } = require('../knowledge/base');
const {
  isValidName,
  isValidPhone,
  isValidTelegram,
  normalizeText,
  isRedirectTrigger,
} = require('../utils/validation');
const logger = require('../utils/logger');

const EMPTY_ANSWER_SENTINEL = 'EMPTY_ANSWER';

/**
 * Extract a raw answer for the current field from a free-text message.
 * Heuristic only — the intent classifier decides whether the message is
 * really an answer; this just trims and caps the length.
 */
function extractFieldAnswer(message, field) {
  const s = normalizeText(message);
  if (!s || s.length > 120) return EMPTY_ANSWER_SENTINEL;
  return s;
}

/**
 * Handle a single incoming text message for a chat.
 * @returns {Promise<string|null>} the reply to send, or null for no reply
 */
async function handleMessage(chatId, text) {
  const message = normalizeText(text);
  if (!message) return null;

  // 1) Hard guardrail pre-filter (cheap, no AI): known off-topic triggers.
  if (isRedirectTrigger(message)) {
    await telegram.sendMessage(chatId, RULES.outOfScopeRedirect);
    return RULES.outOfScopeRedirect;
  }

  let session = store.getSession(chatId);
  if (!session) {
    session = {
      state: 'idle',
      name: null,
      phone: null,
      telegram: null,
      updatedAt: Date.now(),
    };
    store.saveSession(chatId, session);
  }

  // 2) Re-route Telegram help requests at any point in the flow.
  const intent = await classifyIntent(message);

  if (intent.telegramHelpRequested || intent.intent === 'telegram_help') {
    const reply = telegramHelpReply();
    await telegram.sendMessage(chatId, reply);
    return reply;
  }

  // 3) State machine.
  switch (session.state) {
    case 'idle': {
      let reply;
      if (intent.intent === 'greeting') {
        reply = RULES.greeting;
        session.state = 'awaiting_name';
      } else if (intent.intent === 'apply') {
        reply = RULES.askName;
        session.state = 'awaiting_name';
      } else if (intent.intent === 'provide_info') {
        const answer = await askGrounded(message);
        if (answer.outOfScope) {
          reply = RULES.outOfScopeRedirect;
        } else if (answer.applyFlow) {
          reply = RULES.askName;
          session.state = 'awaiting_name';
        } else if (answer.telegramHelp) {
          reply = telegramHelpReply();
        } else {
          reply = answer.text;
        }
      } else {
        // out_of_scope (or unclassifiable)
        reply = RULES.outOfScopeRedirect;
      }
      store.saveSession(chatId, session);
      await telegram.sendMessage(chatId, reply);
      return reply;
    }

    case 'awaiting_name': {
      let reply;
      const raw = extractFieldAnswer(message, 'name');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidName(raw)) {
        reply = 'Please send a valid full name (letters only, 2–80 characters). 📝';
      } else {
        session.name = raw;
        session.state = 'awaiting_phone';
        reply = RULES.askPhone;
      }
      store.saveSession(chatId, session);
      await telegram.sendMessage(chatId, reply);
      return reply;
    }

    case 'awaiting_phone': {
      let reply;
      const raw = extractFieldAnswer(message, 'phone');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidPhone(raw)) {
        reply = RULES.phoneInvalid;
      } else {
        session.phone = raw;
        session.state = 'awaiting_telegram';
        reply = RULES.askTelegram;
      }
      store.saveSession(chatId, session);
      await telegram.sendMessage(chatId, reply);
      return reply;
    }

    case 'awaiting_telegram': {
      let reply;
      const raw = extractFieldAnswer(message, 'telegram');
      if (raw === EMPTY_ANSWER_SENTINEL || !isValidTelegram(raw)) {
        reply = RULES.telegramInvalid;
      } else {
        session.telegram = raw;
        session.state = 'awaiting_confirm';
        reply =
          RULES.confirmHeader +
          `\n• Name: ${session.name}\n• Phone: ${session.phone}\n• Telegram: ${session.telegram}` +
          `\n\n${RULES.confirmPrompt}`;
      }
      store.saveSession(chatId, session);
      await telegram.sendMessage(chatId, reply);
      return reply;
    }

    case 'awaiting_confirm': {
      let reply;
      const lower = message.toLowerCase();

      if (/^(yes|yep|yeah|confirm|submit|ok|done|sure|\u2713|\u2714|haan|ji)/.test(lower)) {
        const result = submitCandidate(session);
        if (result.ok) {
          session.state = 'done';
          reply = RULES.submitted;
        } else if (result.duplicate) {
          session.state = 'done';
          reply = RULES.duplicate;
        } else {
          reply = RULES.error;
        }
      } else if (/name/i.test(lower)) {
        session.name = null;
        session.state = 'awaiting_name';
        reply = RULES.askName;
      } else if (/phone|number/i.test(lower)) {
        session.phone = null;
        session.state = 'awaiting_phone';
        reply = RULES.askPhone;
      } else if (/telegram/i.test(lower)) {
        session.telegram = null;
        session.state = 'awaiting_telegram';
        reply = RULES.askTelegram;
      } else {
        reply = RULES.confirmPrompt;
      }
      store.saveSession(chatId, session);
      await telegram.sendMessage(chatId, reply);
      return reply;
    }

    case 'done': {
      // Post-submission chatter: keep it warm but point back to Telegram.
      const reply =
        'Your application is already submitted — our team will contact you on Telegram shortly. 🎉';
      await telegram.sendMessage(chatId, reply);
      return reply;
    }

    default: {
      logger.warn('Unknown session state, resetting', { chatId, state: session.state });
      store.clearSession(chatId);
      const reply = RULES.greeting;
      await telegram.sendMessage(chatId, reply);
      return reply;
    }
  }
}

/**
 * Assemble the Telegram-help reply: VPN guidance + install + the single
 * direct Telegram join link. The closing is intentionally empty — the link
 * is the hand-off, nothing else follows.
 */
function telegramHelpReply() {
  return TELEGRAM_HELP.intro + '\n\n' + TELEGRAM_HELP.steps.join('\n');
}

module.exports = { handleMessage };
