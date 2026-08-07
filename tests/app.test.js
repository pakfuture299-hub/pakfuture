/**
 * Smoke tests for the Express app (no external services required).
 * Sets dummy env vars before loading the config so boot does not fail.
 */

// Environment must be set before requiring the app/config modules.
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';
process.env.N8N_WEBHOOK_URL = 'http://localhost:9999/webhook/recruitment';
process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
process.env.TELEGRAM_ADMIN_CHAT_ID = '-100123';
process.env.SHOPIFY_WEBHOOK_SECRET = 'sekret';

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub external services so tests run offline and fast (no OpenAI/Telegram).
const openaiStub = {
  classifyIntent: async () => ({ intent: 'greeting', telegramHelpRequested: false }),
  askGrounded: async () => ({ text: 'stubbed' }),
};
const chatStub = {
  getReply: async () => 'stubbed reply with link https://t.me/+923244362726',
};
const telegramStub = {
  sendMessage: async () => true,
  notifyAdmin: async () => true,
};

const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../services/openai' || request === './openai') return openaiStub;
  if (request === '../services/chat' || request === './chat') return chatStub;
  if (request === '../services/telegram' || request === './telegram') return telegramStub;
  return originalLoad.apply(this, arguments);
};

const { createApp } = require('../src/app');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('GET /health returns ok with stats', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.uptime, 'number');
  } finally {
    await close(server);
  }
});

test('POST /webhook/telegram acks immediately and responds 200', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/webhook/telegram`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: 1,
          message: { message_id: 1, chat: { id: 42 }, text: 'hello' },
        }),
      }
    );
    assert.equal(res.status, 200);
  } finally {
    await close(server);
  }
});

test('POST /webhook/telegram with empty body is accepted silently', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/webhook/telegram`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );
    assert.equal(res.status, 200);
  } finally {
    await close(server);
  }
});

test('POST /webhook/shopify with invalid HMAC is rejected when secret set', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/webhook/shopify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1 }),
      }
    );
    assert.equal(res.status, 401);
  } finally {
    await close(server);
  }
});

test('POST /api/chat returns a reply with the Telegram link', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'how do i apply?' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.reply, /https:\/\/t\.me\/\+923244362726/);
  } finally {
    await close(server);
  }
});

test('POST /api/chat rejects empty message', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await close(server);
  }
});

test('GET /widget serves the chat widget HTML', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/widget`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /jpc-launcher/);
    assert.match(html, /api\/chat/);
  } finally {
    await close(server);
  }
});
