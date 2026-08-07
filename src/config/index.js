/**
 * Centralised environment configuration.
 *
 * All secrets are read from environment variables (dotenv loads `.env` in
 * non-production environments and when the file exists). Required variables
 * fail fast with a clear message so misconfiguration is caught at boot,
 * not in production traffic.
 */

const fs = require('fs');
const path = require('path');

// Load .env whenever the file exists. dotenv never overrides variables that
// are already in the environment, so the systemd EnvironmentFile on the VPS
// still takes precedence.
require('dotenv').config({ quiet: true });

const fromEnv = (key, { required = false, fallback } = {}) => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (required) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return fallback;
  }
  return value;
};

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const toBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  env: fromEnv('NODE_ENV', { fallback: 'development' }),
  port: toInt(fromEnv('PORT', { fallback: '3000' }), 3000),

  // Comma-separated list of allowed CORS origins for browser clients.
  allowedOrigins: (fromEnv('ALLOWED_ORIGINS', { fallback: '' }) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  openai: {
    apiKey: fromEnv('OPENAI_API_KEY', { required: true }),
    model: fromEnv('OPENAI_MODEL', { fallback: 'gpt-4o-mini' }),
    // Hard ceiling on single model call latency (ms).
    timeoutMs: toInt(fromEnv('OPENAI_TIMEOUT_MS', { fallback: '15000' }), 15000),
  },

  // The single Telegram invite link the widget hands out.
  inviteLink: fromEnv('INVITE_LINK', {
    fallback: 'https://t.me/+923244362726',
  }),

  n8n: {
    webhookUrl: fromEnv('N8N_WEBHOOK_URL', { fallback: '' }),
    timeoutMs: toInt(
      fromEnv('N8N_WEBHOOK_TIMEOUT_MS', { fallback: '10000' }),
      10000
    ),
    maxRetries: toInt(
      fromEnv('N8N_WEBHOOK_MAX_RETRIES', { fallback: '3' }),
      3
    ),
  },

  telegram: {
    botToken: fromEnv('TELEGRAM_BOT_TOKEN', { fallback: '' }),
    adminChatId: fromEnv('TELEGRAM_ADMIN_CHAT_ID', { fallback: '' }),
    apiBase: 'https://api.telegram.org',
  },

  shopify: {
    webhookSecret: fromEnv('SHOPIFY_WEBHOOK_SECRET', { fallback: '' }),
    apiAccessToken: fromEnv('SHOPIFY_API_ACCESS_TOKEN', { fallback: '' }),
  },

  google: {
    credentialsPath: fromEnv('GOOGLE_CREDENTIALS_PATH', { fallback: '' }),
    // Optional: point n8n at a credentials file that lives on the VPS.
    hasCredentialsFile:
      fromEnv('GOOGLE_CREDENTIALS_PATH', { fallback: '' }) !== '' &&
      fs.existsSync(fromEnv('GOOGLE_CREDENTIALS_PATH', { fallback: '' })),
  },

  limits: {
    ratePerMinute: toInt(
      fromEnv('RATE_LIMIT_PER_MINUTE', { fallback: '10' }),
      10
    ),
    duplicateCooldownMs: toInt(
      fromEnv('DUPLICATE_COOLDOWN_MS', { fallback: String(60 * 60 * 1000) }),
      60 * 60 * 1000
    ),
    sessionTtlMs: toInt(
      fromEnv('SESSION_TTL_MS', { fallback: String(10 * 60 * 60 * 1000) }),
      10 * 60 * 60 * 1000
    ),
  },

  isProduction: () => config.env === 'production',
  isTelegramWebhookEnabled: () => fromEnv('TELEGRAM_WEBHOOK_URL', { fallback: '' }) !== '',
  telegramWebhookUrl: fromEnv('TELEGRAM_WEBHOOK_URL', { fallback: '' }),
};

module.exports = config;
