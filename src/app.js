/**
 * Express application wiring.
 *
 * Routes:
 *   GET  /health        — liveness probe (used by systemd / UptimeRobot)
 *   GET  /              — tiny info page
 *   POST /webhook/shopify — optional Shopify storefront webhook receiver
 *   POST /webhook/telegram — Telegram webhook receiver (production mode)
 *
 * All bodies are JSON with a global 1 MB cap; security headers are applied by
 * Helmet; CORS is limited to the configured storefront origin.
 */

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./utils/logger');
const store = require('./store');
const telegram = require('./services/telegram');
const { handleMessage } = require('./services/conversation');
const { getReply } = require('./services/chat');

function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false, // API-only server; CSP adds no value here
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Minimal CORS for browser widgets calling /health from the storefront.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Simple per-IP rate limiter for webhook endpoints (memory-backed).
  app.use('/webhook', (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ip:${ip}`;
    if (!store.allowMessage(key, Math.max(config.limits.ratePerMinute * 6, 60))) {
      return res.status(429).json({ ok: false, error: 'Too many requests' });
    }
    next();
  });

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
      sessions: store.sessions.size,
      ts: new Date().toISOString(),
    });
  });

  app.get('/', (req, res) => {
    res.json({ ok: true, service: 'job-portal-chatbot' });
  });

  // Chat widget (the embeddable frontend served to the storefront).
  app.get('/widget', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'widget.html'));
  });

  // Storefront chat API — the widget posts visitor messages here. The widget
  // may include a client sessionId so the guided apply flow can keep state.
  app.post('/api/chat', async (req, res) => {
    const message = req.body?.message;
    const sessionId =
      typeof req.body?.sessionId === 'string' && req.body.sessionId
        ? req.body.sessionId.slice(0, 128)
        : undefined;
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ ok: false, error: 'message is required' });
    }
    // Reuse the per-IP rate limiter to keep abuse bounded.
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!store.allowMessage(`chat:${ip}`, config.limits.ratePerMinute)) {
      return res.status(429).json({ ok: false, error: 'Too many requests' });
    }
    try {
      const { reply, sessionId: echoed, submitted } = await getReply(message, sessionId);
      return res.json({ ok: true, reply, sessionId: echoed, submitted: !!submitted });
    } catch (err) {
      logger.error('Chat API failed', { err: err.message });
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  /**
   * Shopify webhook receiver (optional). Verifies the HMAC signature when
   * SHOPIFY_WEBHOOK_SECRET is set, then notifies the admin group.
   * Used for storefront events like order creation / checkout abandonment
   * that you may want surfaced to the hiring team.
   */
  app.post('/webhook/shopify', (req, res) => {
    const hmac = req.get('x-shopify-hmac-sha256');
    const topic = req.get('x-shopify-topic') || 'unknown';

    if (config.shopify.webhookSecret) {
      const digest = crypto
        .createHmac('sha256', config.shopify.webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('base64');
      if (!hmac || hmac !== digest) {
        logger.warn('Shopify webhook HMAC mismatch', { topic });
        return res.status(401).json({ ok: false, error: 'Invalid signature' });
      }
    }

    // Fire-and-forget: never block Shopify's delivery.
    telegram
      .notifyAdmin(`🛍️ Shopify event\nTopic: ${topic}\nPayload: ${JSON.stringify(req.body).slice(0, 1000)}`)
      .catch(() => {});
    res.status(202).json({ ok: true });
  });

  /**
   * Telegram webhook receiver. Telegram expects a 200 response quickly; the
   * heavy work is deferred so the HTTP response is immediate.
   */
  app.post('/webhook/telegram', (req, res) => {
    const update = req.body;
    if (!update || !update.message) {
      return res.status(200).json({ ok: true }); // ack silently
    }

    const chatId = update.message.chat?.id;
    const text = update.message.text;

    if (!chatId || typeof text !== 'string' || !text.trim()) {
      return res.status(200).json({ ok: true });
    }

    res.status(200).json({ ok: true });

    handleMessage(chatId, text).catch((err) => {
      logger.error('Conversation handler failed', { chatId, err: err.message });
      telegram.sendMessage(chatId, 'Something went wrong — please try again. 🙏');
    });
  });

  // Central error handler — never leak stack traces to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error('Unhandled request error', {
      path: req.path,
      err: err.message,
    });
    res.status(err.status || 500).json({ ok: false, error: 'Internal error' });
  });

  return app;
}

module.exports = { createApp };
