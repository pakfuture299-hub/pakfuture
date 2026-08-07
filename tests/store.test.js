/**
 * Tests for the in-memory store: sessions, duplicates, rate limiting.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Config is loaded on require; each test file runs in its own process.
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';

const store = require('../src/store');

test('session lifecycle: save, get, expire, clear', () => {
  const chatId = '111';
  store.saveSession(chatId, { state: 'awaiting_name' });
  assert.equal(store.getSession(chatId).state, 'awaiting_name');

  // Force expiry by rewriting updatedAt on the stored object directly.
  const s = store.sessions.get(chatId);
  s.updatedAt = Date.now() - 100 * 60 * 60 * 1000;
  assert.equal(store.getSession(chatId), null);

  store.saveSession(chatId, { state: 'done' });
  store.clearSession(chatId);
  assert.equal(store.getSession(chatId), null);
});

test('duplicate detection within cooldown', () => {
  const fingerprint = 'phone:03001234567';
  assert.equal(store.isDuplicate(fingerprint), false);
  store.markDuplicate(fingerprint);
  assert.equal(store.isDuplicate(fingerprint), true);
});

test('rate limiter allows limit messages per minute then throttles', () => {
  const chatId = '222';
  for (let i = 0; i < 10; i += 1) {
    assert.ok(store.allowMessage(chatId, 10), `message ${i + 1} allowed`);
  }
  assert.equal(store.allowMessage(chatId, 10), false, '11th message throttled');
});
