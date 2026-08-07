/**
 * Telegram Bot API client.
 *
 * Supports both polling (development, low traffic) and webhook (production)
 * modes. Message sending is fire-and-forget with a light retry so a single
 * Telegram hiccup never blocks the conversation loop.
 */

const config = require('../config');
const { postJsonWithRetry } = require('../utils/http');
const logger = require('../utils/logger');

class TelegramBot {
  constructor() {
    this.token = config.telegram.botToken;
    this.adminChatId = config.telegram.adminChatId;
    this.base = `${config.telegram.apiBase}/bot${this.token}`;
  }

  _url(method) {
    return `${this.base}/${method}`;
  }

  /** Send a text message; resolves true on success. Never throws. */
  async sendMessage(chatId, text, { parseMode = 'HTML' } = {}) {
    if (!text) return false;
    try {
      const body = { chat_id: chatId, text };
      if (parseMode) body.parse_mode = parseMode;
      await postJsonWithRetry(this._url('sendMessage'), body, {
        timeoutMs: 10_000,
        maxRetries: 2,
      });
      return true;
    } catch (err) {
      logger.error('Telegram sendMessage failed', { chatId, err: err.message });
      return false;
    }
  }

  /** Send a message to the private admin group. */
  async notifyAdmin(text) {
    return this.sendMessage(this.adminChatId, text);
  }

  /** Long-polling mode: register a callback for every incoming update. */
  async startPolling(onUpdate, { pollTimeoutSec = 25 } = {}) {
    logger.info('Telegram bot started in polling mode');
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const url =
          this._url('getUpdates') +
          `?timeout=${pollTimeoutSec}&offset=${offset}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = Math.max(offset, update.update_id + 1);
            onUpdate(update).catch((err) =>
              logger.error('onUpdate handler failed', { err: err.message })
            );
          }
        }
      } catch (err) {
        logger.warn('Telegram polling error (will retry)', { err: err.message });
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  /** Webhook mode: set the webhook URL once (idempotent). */
  async setWebhook(url) {
    const res = await fetch(this._url('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, allowed_updates: ['message'] }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`setWebhook failed: ${JSON.stringify(data)}`);
    logger.info('Telegram webhook registered', { url });
    return data;
  }

  /** Delete the webhook (returns to polling). */
  async deleteWebhook() {
    const res = await fetch(this._url('deleteWebhook'));
    return res.json();
  }
}

module.exports = new TelegramBot();
