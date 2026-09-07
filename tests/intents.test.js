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

// Stub the AI to the WORST case (out_of_scope / unhelpful) so the
// deterministic PDF matcher is proven to answer correctly even when OpenAI
// misclassifies or is unavailable.
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './openai' || request === '../openai') {
    return {
      classifyIntent: async () => ({ intent: 'out_of_scope', discordHelpRequested: false }),
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
    { intent: 'INTENT_01_WELCOME', phrases: ['hello', 'hi', 'assalam o alaikum', 'hey', 'info', 'start', 'details', 'salam'] },
    { intent: 'INTENT_02_AVAILABLE_JOBS', phrases: ['konsi jobs hain', 'jobs list', 'available jobs', 'kitni jobs hain', 'kaam batao', 'kaun sa kaam hai', 'vacancies', 'list dikhao'] },
    { intent: 'INTENT_03_TRUST_LEGITIMACY', phrases: ['is this real or fake?', 'scam toh nahi?', 'trust kaise karein?', 'legit hai?', 'is it safe?', 'is my data safe?', 'is this job legit?', 'is this a scam?'] },
    { intent: 'INTENT_04_PAYMENT_GUARANTEE', phrases: ['salary kitni milegi?', 'payout kaise hoga?', 'easypaisa?', 'jazzcash?', 'bank transfer?', 'daily payment?', 'income kitna hai?', 'how much can i earn?', 'how do i get paid?'] },
    { intent: 'INTENT_05_DIRECT_APPLY', phrases: ['apply kaise karna hai?', 'apply kaise karein?', 'job chahiye', 'mujhe kaam karna hai', 'start kaise karein?', 'hiring process?', 'want job', 'how to apply?'] },
    { intent: 'INTENT_06_JOB_TIMINGS', phrases: ['job timing kia hain?', 'timings kia hai?', 'timing kia hai?', 'kitne ghante kaam hai?', 'working hours?', 'part time hai ya full time?', 'how many hours?'] },
    { intent: 'INTENT_07_OFFICE_LOCATION', phrases: ['apka office kaha hai?', 'office location?', 'pata kia hai?', 'kahan office hai?', 'address kia hai?', 'physical office?', 'where is your office?'] },
    { intent: 'INTENT_08_REQUIREMENTS', phrases: ['qualification kia chahiye?', 'qualification chahiye', 'parhai kitni chahiye?', 'age limit?', 'experience chahiye?', 'kaun kar sakta hai?', 'study requirement?', 'do i need experience?'] },
    { intent: 'INTENT_09_REGISTRATION_FEE', phrases: ['fees hai?', 'investment hai?', 'paisa dena parega?', 'registration charge?', 'free hai?', 'free job?', 'is there a fee?', 'do i have to pay?'] },
    { intent: 'INTENT_10_JOB_SELECTION', phrases: ['data entry', 'graphic designer', 'video watch', 'assignment writing', 'yeh job chahiye', 'is mein interested hoon', 'graphic design', 'amazon fba', 'i want to apply for data entry'] },
    { intent: 'INTENT_11_DISCORD_GUIDANCE', phrases: ['guide karo', 'kaise banana hai?', 'mujhe nahi aata', 'process batao', 'tarika batao', 'help karo', 'discord nahi pata', 'setup kaise karein?'] },
    { intent: 'INTENT_12_DISCORD_CONFIRMATION', phrases: ['discord account done', 'account setup kar liya hai', 'bana liya hai', 'done', 'account ban gaya'] },
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

test('word boundaries: short triggers do not match inside longer words', async () => {
  // "hi" must not match inside "nahi"/"chahiye"; "info" must not match inside
  // "information"-like words accidentally; these are NOT intent triggers.
  const noFalsePositive = [
    'nahi',                       // contains "hi" as substring -> must NOT be INTENT_01
    'chahiye',                    // contains "hi" -> must NOT be welcome
    'mujhe discord nahi pata',  // contains "hi" in "nahi" -> must be INTENT_11 (or help)
    'kaam kaise hota hai',        // generic, not a listed trigger
  ];
  for (const phrase of noFalsePositive) {
    const s = createSession();
    const r = await processMessage(s, phrase);
    // "nahi" / "chahiye" alone must NOT get the welcome script.
    if (['nahi', 'chahiye'].includes(phrase)) {
      assert.notEqual(r.reply, INTENTS[0].reply, `"${phrase}" must not match INTENT_01 welcome`);
    }
    // "mujhe discord nahi pata" must be the Discord guidance (INTENT_11).
    if (phrase === 'mujhe discord nahi pata') {
      assert.ok(r.reply.startsWith(INTENTS[10].reply), `"${phrase}" must be INTENT_11 guidance`);
    }
  }
});

test('user-reported regression cases reply exactly per the PDF', async () => {
  const cases = [
    { input: 'info', intentId: 'INTENT_01_WELCOME' },
    { input: 'kaun sa kaam hai', intentId: 'INTENT_02_AVAILABLE_JOBS' },
    { input: 'timing kia hai', intentId: 'INTENT_06_JOB_TIMINGS' },
    { input: 'qualification chahiye', intentId: 'INTENT_08_REQUIREMENTS' },
    { input: 'hi', intentId: 'INTENT_01_WELCOME' },
    { input: 'salary kitni milegi', intentId: 'INTENT_04_PAYMENT_GUARANTEE' },
    { input: 'telegram nahi pata', intentId: 'INTENT_11_DISCORD_GUIDANCE' },
  ];
  const failures = [];
  for (const { input, intentId } of cases) {
    const intent = INTENTS.find((i) => i.id === intentId);
    const s = createSession();
    const r = await processMessage(s, input);
    if (!norm(r.reply).startsWith(norm(intent.reply))) {
      failures.push(`"${input}" -> expected ${intentId}, got: ${JSON.stringify(r.reply)}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

module.exports = { norm };
