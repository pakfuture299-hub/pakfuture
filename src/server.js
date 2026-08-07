/**
 * Process entry point.
 *
 * Boot sequence:
 *  1. load config (fail fast on missing secrets)
 *  2. start HTTP server (health + webhooks)
 *  3. start Telegram in webhook or polling mode
 *  4. install signal handlers for graceful shutdown
 */

const config = require('./config');
const logger = require('./utils/logger');
const { createApp } = require('./app');
const telegram = require('./services/telegram');

async function start() {
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`Chatbot API listening on :${config.port} (${config.env})`);
  });

  // Telegram delivery mode.
  if (config.isTelegramWebhookEnabled()) {
    try {
      await telegram.setWebhook(config.telegramWebhookUrl);
    } catch (err) {
      logger.error('Failed to register Telegram webhook; falling back to polling', {
        err: err.message,
      });
      startPolling();
    }
  } else {
    startPolling();
  }

  function startPolling() {
    const { handleMessage } = require('./services/conversation');
    telegram.startPolling((update) => {
      const chatId = update.message?.chat?.id;
      const text = update.message?.text;
      if (chatId && typeof text === 'string' && text.trim()) {
        return handleMessage(chatId, text);
      }
      return Promise.resolve();
    });
  }

  // Graceful shutdown: stop accepting connections, let in-flight queue drain.
  const shutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Fatal boot error', { err: err.message });
  process.exit(1);
});
