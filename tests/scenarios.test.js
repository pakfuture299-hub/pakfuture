/**
 * Comprehensive PDF scenario sweep.
 *
 * Exercises EVERY scenario the client's architecture PDF contains: all 12
 * intents, each with its trigger keywords and natural sentence variations,
 * in a fresh session, mid-flow (field collection), and the full guided apply
 * flow including mid-flow safety questions and the Google Sheet submission
 * contract. The AI is stubbed to the WORST case (out_of_scope) so the
 * deterministic PDF matcher is proven correct even when OpenAI fails.
 */

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Module = require('module');
const originalLoad = Module._load;
const submissions = [];
Module._load = function (request, parent, isMain) {
  if (request === './openai' || request === '../openai') {
    return {
      classifyIntent: async () => ({ intent: 'out_of_scope', telegramHelpRequested: false }),
      askGrounded: async () => ({ text: 'STUB_SHOULD_NEVER_RUN' }),
    };
  }
  if (request === './submission' || request === '../submission') {
    return {
      submitCandidate: (session) => {
        submissions.push({
          name: session.name,
          phone: session.phone,
          telegram: session.telegram,
          job: session.job || '',
          timestamp: new Date().toISOString(),
          source: 'Job Portal Global',
        });
        return { ok: true, duplicate: false };
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const { createSession, processMessage } = require('../src/services/flow');
const { INTENTS, JOBS, RULES, RULES_HI } = require('../src/knowledge/base');

function norm(s) {
  return String(s).trim();
}

// ---- The full PDF scenario table ----
const SCENARIOS = [
  // [intentId, [phrasings...]]
  ['INTENT_01_WELCOME', ['hi', 'hello', 'salam', 'assalam o alaikum', 'hey', 'start', 'info', 'details']],
  ['INTENT_02_AVAILABLE_JOBS', ['konsi konsi jobs hain', 'konsi job hai', 'kaun sa kaam hai', 'jobs list', 'available jobs', 'vacancies', 'kis tarah ka kaam hai', 'kitni jobs hain', 'job categories', 'list dikhao', 'kaam batao']],
  ['INTENT_03_TRUST_LEGITIMACY', ['real hai ya fake', 'scam toh nahi', 'trust kaise karein', 'proof hai', 'legit hai', 'scam', 'fake job', 'is this real', 'is this legit', 'is it safe', 'is this safe', 'is my data safe', 'is this a scam']],
  ['INTENT_04_PAYMENT_GUARANTEE', ['salary kitni milegi', 'payout kaise hoga', 'easypaisa', 'jazzcash', 'bank transfer', 'daily payment', 'weekly payment', 'income', 'how much can i earn', 'salary', 'how do i get paid']],
  ['INTENT_05_DIRECT_APPLY', ['job chahiye', 'apply kaise karein', 'apply kaise karna hai', 'mujhe kaam karna hai', 'start kaise karein', 'hiring process', 'want job', 'how to apply']],
  ['INTENT_06_JOB_TIMINGS', ['job timing kia hain', 'timings kia hai', 'timing kia hai', 'kitne ghante kaam hai', 'time kia hai', 'working hours', 'part time hai ya full time', 'kaam ka time', 'how many hours']],
  ['INTENT_07_OFFICE_LOCATION', ['apka office kaha hai', 'office location', 'pata kia hai', 'kahan office hai', 'city kon sa hai', 'address kia hai', 'physical office', 'where is your office']],
  ['INTENT_08_REQUIREMENTS', ['qualification kia chahiye', 'qualification chahiye', 'parhai kitni chahiye', 'age limit', 'experience chahiye', 'kaun kar sakta hai', 'study requirement', 'do i need experience']],
  ['INTENT_09_REGISTRATION_FEE', ['fees hai', 'investment hai', 'paisa dena parega', 'registration charge', 'free hai', 'free job', 'is there a fee', 'do i have to pay', 'is it free']],
  ['INTENT_10_JOB_SELECTION', ['data entry', 'content writing', 'video watch', 'graphic designer', 'amazon va', 'assignment writing', 'yeh job chahiye', 'is mein interested hoon', 'graphic design', 'video editing', 'amazon fba', 'i want to apply for data entry']],
  ['INTENT_11_TELEGRAM_GUIDANCE', ['guide karo', 'kaise banana hai', 'mujhe nahi aata', 'process batao', 'tarika batao', 'help karo', 'guide me', 'setup kaise karein', 'telegram nahi pata']],
  ['INTENT_12_TELEGRAM_CONFIRMATION', ['telegram account done', 'account setup kar liya hai', 'bana liya hai', 'done', 'account ban gaya', 'telegram ban gaya', 'setup done', 'account ready hai']],
];

test('SCENARIO SWEEP: every PDF intent × every trigger → EXACT reply (worst-case AI)', async () => {
  const failures = [];
  for (const [intentId, phrasings] of SCENARIOS) {
    const intent = INTENTS.find((i) => i.id === intentId);
    for (const phrase of phrasings) {
      const s = createSession();
      let r;
      try {
        r = await processMessage(s, phrase);
      } catch (e) {
        failures.push(`[${intentId}] "${phrase}" THREW: ${e.message}`);
        continue;
      }
      const reply = norm(r.reply);
      // Knowledge/flow intents: the PDF script must be the reply (or a prefix
      // when the flow appends its own question, e.g. apply ask).
      if (!reply.startsWith(norm(intent.reply))) {
        failures.push(
          `[${intentId}] "${phrase}"\n  EXPECTED PREFIX: ${JSON.stringify(norm(intent.reply))}\n  GOT:             ${JSON.stringify(reply)}`
        );
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n\n'));
});

test('SCENARIO: mid-field questions are answered and the field re-asked (flow never lost)', async () => {
  const checks = [
    { field: 'awaiting_name', msg: 'salary kitni milegi', expectField: 'name|naam' },
    { field: 'awaiting_name', msg: 'is it safe?', expectField: 'name|naam' },
    { field: 'awaiting_phone', msg: 'qualification chahiye', expectField: 'number|phone' },
    { field: 'awaiting_phone', msg: 'is my data safe?', expectField: 'number|phone' },
    { field: 'awaiting_telegram', msg: 'konsi jobs hain?', expectField: 'telegram' },
    { field: 'awaiting_confirm', msg: 'data entry', expectField: 'confirm|Yes|Haan' },
  ];
  const failures = [];
  for (const { field, msg, expectField } of checks) {
    const s = createSession();
    s.state = field;
    const r = await processMessage(s, msg);
    if (r.session.state !== field) {
      failures.push(`mid-field "${msg}" in ${field} moved state to ${r.session.state}`);
      continue;
    }
    if (!new RegExp(expectField, 'i').test(r.reply)) {
      failures.push(`mid-field "${msg}" in ${field} reply lacks "${expectField}": ${JSON.stringify(r.reply)}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('SCENARIO: full guided flow with mid-flow safety question → Google Sheet contract', async () => {
  const s = createSession();
  const steps = [
    'data entry',                // INTENT_10 job select
    'is it safe?',               // safety -> INTENT_03, flow preserved
    'haan',                      // yes to apply -> awaiting_name
    'Ali Raza',                  // name
    'is my data safe with you?', // safety mid-phone -> INTENT_03 + phone re-ask
    '03001234567',               // phone
    '@ali_r',                    // telegram
    'yes',                       // confirm -> submit
  ];
  let lastState = '';
  for (const msg of steps) {
    const r = await processMessage(s, msg);
    lastState = r.session.state;
  }
  assert.equal(lastState, 'done');
  assert.equal(submissions.length, 1);
  const sub = submissions[0];
  assert.equal(sub.name, 'Ali Raza');
  assert.equal(sub.phone, '03001234567');
  assert.equal(sub.telegram, '@ali_r');
  assert.equal(sub.job, 'Data Entry');
  assert.ok(sub.source && sub.timestamp, 'Google Sheet contract needs source + timestamp');
});

test('SCENARIO: every job name in the PDF list resolves and captures the job', async () => {
  for (const job of JOBS) {
    const s = createSession();
    const r = await processMessage(s, job.name);
    assert.ok(norm(r.reply).startsWith(norm(INTENTS[9].reply)), `${job.name} should answer INTENT_10`);
    assert.equal(r.session.job, job.name, `${job.name} should be captured as the chosen job`);
  }
});

test('SCENARIO: done state resets on a new message (no stuck state)', async () => {
  const s = createSession();
  s.state = 'done';
  const r = await processMessage(s, 'hi');
  assert.equal(r.session.state, 'idle');
  assert.equal(norm(r.reply), norm(INTENTS[0].reply));
});

test('SCENARIO: out-of-PDF messages redirect, never improvise', async () => {
  const s = createSession();
  const r = await processMessage(s, 'what is the weather in lahore?');
  assert.match(r.reply, /website|sirf hamari/);
});
