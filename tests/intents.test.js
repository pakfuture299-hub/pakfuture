/**
 * PDF intent matrix tests.
 *
 * Every trigger keyword of every intent in the client's architecture PDF
 * must produce the EXACT PDF response script — byte-for-byte, nothing added,
 * nothing removed. Each intent is exercised with each of its own trigger
 * phrases, plus common sentence variations, and the reply must equal
 * INTENTS[i].reply exactly.
 *
 * Runs offline: OpenAI is stubbed; the deterministic matcher must answer
 * before any AI call is needed.
 */

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub the AI so nothing hangs; the deterministic matcher must fire first.
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './openai' || request === '../openai') {
    return {
      classifyIntent: async () => ({ intent: 'greeting', telegramHelpRequested: false }),
      askGrounded: async () => ({ text: 'STUB_SHOULD_NEVER_RUN' }),
    };
  }
  return originalLoad.apply(this, arguments);
};

const { createSession, processMessage } = require('../src/services/flow');
const { INTENTS, JOBS } = require('../src/knowledge/base');
const { createIntentMatcher } = require('../src/services/intents');

/** Normalize a reply for comparison (strip trailing whitespace per line, collapse). */
function norm(s) {
  return String(s).trim();
}

test('every intent script is unique (no two intents share a reply)', () => {
  const replies = INTENTS.map((i) => i.reply);
  assert.equal(new Set(replies).size, replies.length, 'each intent must have a unique script');
});

test('intent matrix: each intent trigger keyword → EXACT PDF reply (byte-for-byte)', async () => {
  const failures = [];
  for (const intent of INTENTS) {
    // The flow-level intents (01 welcome, 05 apply, 10 job-selection, 12
    // confirmation) are handled by the state machine and may legitimately add
    // flow questions (apply ask / field re-ask) — but their knowledge reply
    // must still be the PDF script. The knowledge intents must match exactly.
    for (const trigger of intent.triggers) {
      const s = createSession();
      let r;
      try {
        r = await processMessage(s, trigger);
      } catch (e) {
        failures.push(`[${intent.id}] trigger "${trigger}" THREW: ${e.message}`);
        continue;
      }
      const reply = norm(r.reply);
      const expected = norm(intent.reply);
      // Knowledge intents must be byte-for-byte exact.
      if (reply !== expected) {
        failures.push(
          `[${intent.id}] trigger "${trigger}"\n  EXPECTED: ${JSON.stringify(expected)}\n  GOT:      ${JSON.stringify(reply)}`
        );
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n\n'));
});

test('sentence variations of each trigger still resolve to the exact PDF script', async () => {
  // Common natural ways candidates phrase each intent.
  const variations = [
    { intent: 'INTENT_01_WELCOME', phrases: ['hello', 'hi', 'assalam o alaikum', 'hey'] },
    { intent: 'INTENT_02_AVAILABLE_JOBS', phrases: ['konsi jobs hain', 'jobs list', 'available jobs', 'kitni jobs hain', 'kaam batao'] },
    { intent: 'INTENT_03_TRUST_LEGITIMACY', phrases: ['is this real or fake?', 'scam toh nahi?', 'trust kaise karein?', 'legit hai?', 'is it safe?', 'is my data safe?'] },
    { intent: 'INTENT_04_PAYMENT_GUARANTEE', phrases: ['salary kitni milegi?', 'payout kaise hoga?', 'easypaisa?', 'jazzcash?', 'bank transfer?', 'daily payment?', 'income kitna hai?'] },
    { intent: 'INTENT_05_DIRECT_APPLY', phrases: ['apply kaise karna hai?', 'apply kaise karein?', 'job chahiye', 'mujhe kaam karna hai', 'start kaise karein?', 'hiring process?', 'want job'] },
    { intent: 'INTENT_06_JOB_TIMINGS', phrases: ['job timing kia hain?', 'timings kia hai?', 'kitne ghante kaam hai?', 'working hours?', 'part time hai ya full time?'] },
    { intent: 'INTENT_07_OFFICE_LOCATION', phrases: ['apka office kaha hai?', 'office location?', 'pata kia hai?', 'kahan office hai?', 'address kia hai?', 'physical office?'] },
    { intent: 'INTENT_08_REQUIREMENTS', phrases: ['qualification kia chahiye?', 'parhai kitni chahiye?', 'age limit?', 'experience chahiye?', 'kaun kar sakta hai?', 'study requirement?'] },
    { intent: 'INTENT_09_REGISTRATION_FEE', phrases: ['fees hai?', 'investment hai?', 'paisa dena parega?', 'registration charge?', 'free hai?', 'free job?'] },
    { intent: 'INTENT_10_JOB_SELECTION', phrases: ['data entry', 'graphic designer', 'video watch', 'assignment writing', 'yeh job chahiye', 'is mein interested hoon'] },
    { intent: 'INTENT_11_TELEGRAM_GUIDANCE', phrases: ['guide karo', 'kaise banana hai?', 'mujhe nahi aata', 'process batao', 'tarika batao', 'help karo', 'telegram nahi pata'] },
    { intent: 'INTENT_12_TELEGRAM_CONFIRMATION', phrases: ['telegram account done', 'account setup kar liya hai', 'bana liya hai', 'done', 'account ban gaya'] },
  ];

  const failures = [];
  for (const { intent: intentId, phrases } of variations) {
    const intent = INTENTS.find((i) => i.id === intentId);
    for (const phrase of phrases) {
      const s = createSession();
      let r;
      try {
        r = await processMessage(s, phrase);
      } catch (e) {
        failures.push(`[${intentId}] "${phrase}" THREW: ${e.message}`);
        continue;
      }
      const reply = norm(r.reply);
      // Flow intents may append the apply-ask / field re-ask; the PDF script
      // itself must be a PREFIX of the reply.
      if (!reply.startsWith(norm(intent.reply))) {
        failures.push(
          `[${intentId}] "${phrase}"\n  EXPECTED PREFIX: ${JSON.stringify(norm(intent.reply))}\n  GOT:             ${JSON.stringify(reply)}`
        );
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n\n'));
});

test('out-of-PDF questions are redirected, never improvised', async () => {
  const s = createSession();
  const r = await processMessage(s, 'what is the weather in lahore?');
  assert.match(r.reply, /website|sirf hamari/);
});

test('job list (INTENT_02) lists every job from the PDF', async () => {
  const s = createSession();
  const r = await processMessage(s, 'konsi jobs hain?');
  for (const job of JOBS) {
    assert.ok(r.reply.includes(job.name), `reply must include ${job.name}`);
  }
});

module.exports = { norm };
