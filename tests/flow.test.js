/**
 * Tests for the guided apply flow (src/services/flow.js).
 * Runs offline: OpenAI and submission are stubbed.
 */

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub the AI + submission so the state machine runs deterministically.
const Module = require('module');
const originalLoad = Module._load;
let intentResult = { intent: 'greeting', discordHelpRequested: false };
let groundedResult = { text: 'stubbed' };
const submissions = [];

Module._load = function (request, parent, isMain) {
  if (request === './openai' || request === '../openai') {
    return {
      classifyIntent: async () => intentResult,
      askGrounded: async () => groundedResult,
    };
  }
  if (request === './submission' || request === '../submission') {
    return {
      submitCandidate: (session) => {
        submissions.push({ ...session });
        return { ok: true, duplicate: false };
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const { createSession, processMessage, detectLanguage, isYes, isNo, detectSentiment } = require('../src/services/flow');
const { INTENTS, RULES, RULES_HI } = require('../src/knowledge/base');

function fresh() {
  return createSession();
}

function setIntent(intent) {
  intentResult = { intent, discordHelpRequested: false };
}

test('detectLanguage: english stays en', () => {
  assert.equal(detectLanguage('hello, how do i apply for a job?'), 'en');
  assert.equal(detectLanguage('what is the salary'), 'en');
});

test('detectLanguage: hinglish markers switch to hi', () => {
  assert.equal(detectLanguage('haan main apply karna chahata hoon'), 'hi');
  assert.equal(detectLanguage('aap ki jobs kya hain'), 'hi');
  assert.equal(detectLanguage('nahi, mujhe discord nahi pata'), 'hi');
});

test('isYes / isNo parse plain answers', () => {
  assert.equal(isYes('haan'), true);
  assert.equal(isYes('yes'), true);
  assert.equal(isYes('ji haan'), true);
  assert.equal(isNo('nahi'), true);
  assert.equal(isNo('no'), true);
  assert.equal(isYes('nahi'), false);
  assert.equal(isNo('haan'), false);
});

test('greeting gets a SHORT intro, no pitch, stays in idle', async () => {
  setIntent('greeting');
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'hi');
  assert.equal(s.state, 'idle');
  // Short intro — no pitch, no "do you have discord" yet.
  assert.doesNotMatch(reply, /WhatsApp/);
  assert.doesNotMatch(reply, /Discord account pehle se bana/);
  assert.match(reply, /Welcome|hello|hi/i);
});

test('job info answer → exact INTENT_10 script, no extra prompts', async () => {
  setIntent('provide_info');
  groundedResult = { text: 'Video Watch and Earn lets you watch ads for rewards.' };
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'tell me about video watch and earn');
  assert.equal(s.state, 'awaiting_apply_decision'); // INTENT_10 moves to apply decision
  assert.equal(reply, INTENTS[9].reply); // EXACT PDF script, byte-for-byte
});

test('apply intent from idle → exact INTENT_10 script + apply ask', async () => {
  setIntent('apply');
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'i want to apply');
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.ok(reply.startsWith(INTENTS[9].reply)); // INTENT_10 pitch present
  assert.match(reply, /interested in applying/i); // flow's apply question
});

test('Hinglish apply → Hinglish pitch', async () => {
  setIntent('apply');
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'haan, main apply karna chahata hoon');
  assert.equal(s.lang, 'hi');
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.match(reply, /WhatsApp/);
  assert.match(reply, /apply karne mein interested/i);
});

test('apply decision: no → polite close, done', async () => {
  const session = fresh();
  setIntent('apply');
  await processMessage(session, 'i want to apply');
  setIntent('greeting');
  const { reply, session: s } = await processMessage(session, 'nahi');
  assert.equal(s.state, 'done');
  assert.match(reply, /problem|masla|change your mind|dil kare/i);
});

test('full happy path: apply → yes → name → phone → discord → confirm → submit + team username', async () => {
  const session = fresh();
  setIntent('apply');
  await processMessage(session, 'i want to apply'); // → awaiting_apply_decision
  let r = await processMessage(session, 'haan'); // → awaiting_name
  assert.equal(r.session.state, 'awaiting_name');
  r = await processMessage(session, 'Ali Raza'); // → awaiting_phone
  assert.equal(r.session.state, 'awaiting_phone');
  r = await processMessage(session, '03001234567'); // → awaiting_discord
  assert.equal(r.session.state, 'awaiting_discord');
  r = await processMessage(session, 'ali_raza'); // → awaiting_confirm
  assert.equal(r.session.state, 'awaiting_confirm');
  assert.match(r.reply, /Ali Raza/);
  assert.match(r.reply, /03001234567/);
  r = await processMessage(session, 'yes'); // → done + submitted + team username
  assert.equal(r.session.state, 'done');
  assert.equal(r.submitted, true);
  assert.match(r.reply, /bukhtiyaarhussainbranch2050/); // team Discord username at the end
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].name, 'Ali Raza');
  assert.equal(submissions[0].phone, '03001234567');
  assert.equal(submissions[0].discord, 'ali_raza');
});

test('invalid name / phone / discord are rejected and re-asked', async () => {
  const session = fresh();
  setIntent('apply');
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  let r = await processMessage(session, '123'); // invalid name
  assert.equal(r.session.state, 'awaiting_name');
  r = await processMessage(session, 'Ali Raza');
  r = await processMessage(session, 'abc'); // invalid phone
  assert.equal(r.session.state, 'awaiting_phone');
  r = await processMessage(session, '03001234567');
  r = await processMessage(session, 'a'); // invalid discord username
  assert.equal(r.session.state, 'awaiting_discord');
});

test('field edit on confirm resets that field', async () => {
  const session = fresh();
  setIntent('apply');
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567');
  await processMessage(session, 'ali_raza');
  let r = await processMessage(session, 'name'); // edit name
  assert.equal(r.session.state, 'awaiting_name');
  assert.equal(r.session.name, null);
});

test('discord help intent interrupts and returns links', async () => {
  const session = fresh();
  intentResult = { intent: 'discord_help', discordHelpRequested: true };
  const { reply } = await processMessage(session, 'discord nahi pata kya hai');
  assert.match(reply, /play\.google\.com\/store\/apps\/details\?id=com\.discord/); // INTENT_11 Discord app link
  setIntent('greeting');
});

test('out_of_scope intent redirects', async () => {
  const session = fresh();
  setIntent('out_of_scope');
  const { reply } = await processMessage(session, 'refund kya policy hai');
  assert.match(reply, /website/);
});

test('sentiment "how are you" gets a warm reply without any AI call', async () => {
  // Even if the AI classify were to return out_of_scope, the deterministic
  // sentiment handler fires first and must produce a warm reply.
  setIntent('out_of_scope');
  const session = fresh();
  const { reply } = await processMessage(session, 'how are you?');
  assert.match(reply, /great|theek hoon/i);
  assert.doesNotMatch(reply, /website/); // never redirected
});

test('sentiment "thanks" / "bye" get warm replies', async () => {
  setIntent('out_of_scope');
  let { reply } = await processMessage(fresh(), 'thank you so much!');
  assert.match(reply, /welcome|shukriya/i);
  ({ reply } = await processMessage(fresh(), 'bye'));
  assert.match(reply, /goodbye|allah hafiz/i);
});

test('sentiment reply follows the detected language (Hinglish)', async () => {
  setIntent('out_of_scope');
  const session = fresh();
  const { reply } = await processMessage(session, 'aap kaise ho?');
  assert.match(reply, /theek hoon/i);
});

test('detectSentiment returns the matching key', () => {
  assert.equal(detectSentiment('how are you?'), 'howAreYou');
  assert.equal(detectSentiment('shukriya bhai'), 'thanks');
  assert.equal(detectSentiment('good morning'), 'goodMorning');
  assert.equal(detectSentiment('okay'), 'ok');
  assert.equal(detectSentiment('what is 2+2?'), null);
});

test('out-of-context question mid-flow redirects (awaiting_interest)', async () => {
  setIntent('out_of_scope');
  groundedResult = { outOfScope: true };
  const session = fresh();
  session.state = 'awaiting_interest'; // simulate
  const { reply, session: s } = await processMessage(session, 'what is the weather in lahore?');
  assert.match(reply, /website/);
  assert.equal(s.state, 'awaiting_interest'); // flow preserved, not pushed forward
});

test('out-of-context question mid-flow redirects (awaiting_apply_decision)', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply'); // → awaiting_apply_decision
  setIntent('out_of_scope');
  groundedResult = { outOfScope: true };
  const { reply, session: s } = await processMessage(session, 'who won the world cup?');
  assert.match(reply, /website/);
  assert.equal(s.state, 'awaiting_apply_decision');
});

test('job question mid-flow (awaiting_interest) is answered, not pushed to pitch', async () => {
  // Even when the model mislabels "konsi jobs hain" as greeting, the
  // question-like text must be answered from the knowledge base.
  setIntent('provide_info');
  groundedResult = { text: 'Video Watch and Earn lets you watch ads for rewards.' };
  const session = fresh();
  session.state = 'awaiting_interest'; // simulate an interested candidate
  setIntent('greeting'); // simulate the classifier mislabeling a Hinglish question
  groundedResult = { text: 'We have 10 jobs: Video Watch and Earn, Assignment Writing, ...' };
  const { reply, session: s } = await processMessage(session, 'konsi jobs hain?');
  assert.match(reply, /10 jobs|Video Watch and Earn/i); // answered from knowledge
  assert.doesNotMatch(reply, /WhatsApp/); // no pitch
  assert.equal(s.state, 'awaiting_interest'); // flow preserved
});

test('"konsi jobs hain" as first message is answered, not greeted', async () => {
  // The classifier may mislabel "konsi jobs hain?" as greeting — the flow
  // must still answer the question from the knowledge base.
  setIntent('greeting'); // simulate misclassification
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'konsi jobs hain?');
  assert.match(reply, /Video Watch and Earn/); // the list is deterministic
  assert.match(reply, /Amazon FBA/); // all jobs listed
  assert.doesNotMatch(reply, /WhatsApp/); // not a pitch
  assert.equal(s.state, 'awaiting_interest');
});

test('job question mid-flow (awaiting_apply_decision) is answered, not re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply'); // → awaiting_apply_decision
  setIntent('provide_info');
  groundedResult = { text: 'We have 10 jobs: Video Watch and Earn, Assignment Writing, ...' };
  const { reply, session: s } = await processMessage(session, 'konsi jobs hain?');
  assert.match(reply, /10 jobs|Video Watch and Earn/i); // answered
  assert.equal(s.state, 'awaiting_apply_decision'); // still awaiting decision
  assert.match(reply, /apply|interested/i); // still nudges toward applying
});

test('language switches to Hinglish mid-conversation', async () => {
  setIntent('provide_info');
  groundedResult = { text: 'Video Watch and Earn lets you watch ads for rewards.' };
  const session = fresh();
  await processMessage(session, 'tell me about video watch and earn'); // en session
  assert.equal(session.lang, 'en');
  // Now the user writes in Roman Urdu — the reply must be Hinglish.
  setIntent('provide_info');
  groundedResult = { text: 'Humare paas 10 jobs hain: Video Watch and Earn, ...' };
  const { reply, session: s } = await processMessage(session, 'konsi jobs hain?');
  assert.equal(s.lang, 'hi');
  assert.match(reply, /10 jobs|Video Watch and Earn/i);
});

test('English follow-up in a Hinglish session answers with the exact PDF intent script', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'haan, main apply karna chahata hoon'); // → hi
  assert.equal(session.lang, 'hi');
  setIntent('provide_info');
  groundedResult = { text: 'The salary is paid weekly in PKR.' };
  const { reply, session: s } = await processMessage(session, 'what is the salary?');
  assert.equal(reply, INTENTS[3].reply); // EXACT INTENT_04 script (deterministic, lang-independent)
  assert.equal(s.lang, 'hi'); // lang stays; the PDF script is fixed
});

test('explicit "i am interested" in awaiting_interest goes to pitch', async () => {
  setIntent('apply');
  const session = fresh();
  session.state = 'awaiting_interest'; // simulate an interested candidate
  const { reply, session: s } = await processMessage(session, 'i am interested');
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.ok(reply.startsWith(INTENTS[9].reply)); // INTENT_10 pitch shown
});

test('loose job name is answered from knowledge, not redirected', async () => {
  // "graphic design" is not in the knowledge base verbatim — the flow must
  // match it to "Graphic Designer" deterministically and answer, never
  // give the "I can only help with our jobs" redirect.
  setIntent('provide_info');
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'graphic design kaise hota hai?');
  assert.equal(reply, INTENTS[9].reply); // EXACT INTENT_10 script
  assert.doesNotMatch(reply, /can only|sirf hamari|out of scope/i); // no redirect
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.equal(s.job, 'Graphic Designer'); // job captured in session
});

test('loose job name in awaiting_apply_decision is answered, not re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  session.state = 'awaiting_apply_decision'; // simulate
  setIntent('provide_info');
  const { reply, session: s } = await processMessage(session, 'data entry kya hai?');
  assert.equal(reply, INTENTS[9].reply); // EXACT INTENT_10 script
  assert.equal(s.state, 'awaiting_apply_decision'); // still awaiting decision
  assert.equal(s.job, 'Data Entry'); // job captured
});

test('job named during name collection captures the job, name re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan'); // → awaiting_name
  const { reply, session: s } = await processMessage(session, 'i want to apply for data entry');
  assert.equal(s.state, 'awaiting_name'); // flow preserved — name still asked
  assert.equal(s.job, 'Data Entry'); // job captured
  assert.equal(s.name, null); // NOT stored as name
  assert.equal(reply, INTENTS[9].reply + '\n\n' + RULES_HI.askName); // EXACT INTENT_10 + Hinglish name re-ask
});

test('"which job am i applying for" during name collection answers, not stored as name', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan'); // → awaiting_name
  const { reply, session: s } = await processMessage(session, 'konsi job ke liye apply kar rahe?');
  assert.equal(s.state, 'awaiting_name'); // still asking for name
  assert.equal(s.name, null); // NOT stored as name
  assert.match(reply, /name|naam/i);
});

test('chosen job appears in confirm screen and submission', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  // Job named during name collection → interest → pitch → back to flow.
  await processMessage(session, 'i want to apply for graphic designer'); // job captured
  await processMessage(session, 'haan'); // yes to the pitch → awaiting_name
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567');
  const r = await processMessage(session, 'ali_raza'); // → awaiting_confirm
  assert.match(r.reply, /Graphic Designer/); // job in confirm screen
  await processMessage(session, 'yes');
  assert.equal(submissions[submissions.length - 1].job, 'Graphic Designer'); // job in submission
});

test('done state: new message resets to a fresh conversation (no duplicate submit)', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567');
  await processMessage(session, 'ali_raza');
  await processMessage(session, 'yes');
  const before = submissions.length;
  setIntent('greeting');
  const { reply, session: s, submitted } = await processMessage(session, 'hello?');
  assert.equal(submissions.length, before);
  assert.equal(submitted, undefined);
  assert.equal(s.state, 'idle'); // reset to fresh conversation
  assert.match(reply, /Welcome|hello|hi/i); // short greeting again, not "already submitted"
});

// ---- Ruthless failure matrix: every "user said X, bot did Y" complaint ----

test('RUTHLESS: "i am no longer interested" while asked for phone closes politely', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza'); // → awaiting_phone
  const { reply, session: s } = await processMessage(session, "i'm no longer interested");
  assert.equal(s.state, 'done');
  assert.match(reply, /problem|masla|change your mind|dil kare|no problem/i);
  assert.equal(s.phone, null); // not polluted
});

test('RUTHLESS: "i am no longer interested" while asked for discord closes', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567'); // → awaiting_discord
  const { reply, session: s } = await processMessage(session, 'im no longer interested now');
  assert.equal(s.state, 'done');
  assert.match(reply, /problem|masla|change your mind|dil kare|no problem/i);
});

test('RUTHLESS: "cancel" during name collection backs out', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes'); // → awaiting_name
  const { reply, session: s } = await processMessage(session, 'cancel please');
  assert.equal(s.state, 'done');
  assert.equal(s.name, null);
});

test('RUTHLESS: plain "no" while asked for phone closes, not loop', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  const { reply, session: s } = await processMessage(session, 'no');
  assert.equal(s.state, 'done');
  assert.match(reply, /problem|masla|change your mind|dil kare|no problem/i);
});

test('RUTHLESS: plain "no" at confirm closes, not re-ask', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567');
  await processMessage(session, 'ali_raza'); // → awaiting_confirm
  const before = submissions.length;
  const { reply, session: s } = await processMessage(session, 'no');
  assert.equal(s.state, 'done');
  assert.match(reply, /problem|masla|change your mind|dil kare|no problem/i);
  assert.equal(submissions.length, before); // nothing new submitted
});

test('RUTHLESS: "amazon fba" alone (out_of_scope classifier) is answered, not redirected', async () => {
  setIntent('out_of_scope'); // simulate the classifier failing on a bare job name
  groundedResult = { outOfScope: true }; // model would also say out of scope
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'amazon fba');
  assert.equal(reply, INTENTS[9].reply); // EXACT INTENT_10 script
  assert.doesNotMatch(reply, /can only|sirf hamari|out of scope/i);
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.equal(s.job, 'Amazon FBA');
});

test('RUTHLESS: every job name resolves via matchJob', () => {
  const { matchJob } = require('../src/services/flow');
  const cases = [
    ['video watch and earn', 'Video Watch and Earn'],
    ['video watch', 'Video Watch and Earn'],
    ['assignment writing', 'Assignment Writing'],
    ['assignment', 'Assignment Writing'],
    ['content writing', 'Content Writing'],
    ['graphic designer', 'Graphic Designer'],
    ['graphic design', 'Graphic Designer'],
    ['travel and booking support', 'Travel and Booking Support'],
    ['travel booking', 'Travel and Booking Support'],
    ['video editing job', 'Video Editing Job'],
    ['video editing', 'Video Editing Job'],
    ['digital marketing', 'Digital Marketing'],
    ['marketing', 'Digital Marketing'],
    ['data entry', 'Data Entry'],
    ['data typing', 'Data Entry'],
    ['amazon virtual assistant', 'Amazon Virtual Assistant'],
    ['amazon fba', 'Amazon FBA'],
    ['fba', 'Amazon FBA'],
  ];
  for (const [input, expected] of cases) {
    const m = matchJob(input);
    assert.ok(m, `"${input}" should match a job`);
    assert.equal(m.name, expected, `"${input}" should map to ${expected}`);
  }
});

test('RUTHLESS: misclassified knowledge questions still get an answer, not redirect', async () => {
  setIntent('out_of_scope'); // classifier fails
  groundedResult = { text: 'We offer daily and weekly earning opportunities with secure, timely payouts in PKR.' };
  const session = fresh();
  const { reply } = await processMessage(session, 'how much can i earn?');
  // Even with the classifier wrong, the deterministic PDF matcher routes it
  // to the exact INTENT_04 script — never a redirect.
  assert.equal(reply, INTENTS[3].reply);
});

test('RUTHLESS: "no" at interest prompt closes politely, not pitch', async () => {
  setIntent('provide_info');
  groundedResult = { text: 'Video Watch and Earn lets you watch ads for rewards.' };
  const session = fresh();
  await processMessage(session, 'tell me about video watch and earn'); // → awaiting_interest
  setIntent('greeting');
  const { reply, session: s } = await processMessage(session, 'no');
  assert.equal(s.state, 'done');
  assert.match(reply, /problem|masla|change your mind|dil kare|no problem/i);
});

test('RUTHLESS: discord help request mid-flow gets setup guide, not validation error', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567'); // → awaiting_discord
  setIntent('greeting'); // classifier fails to see the help request
  const { reply, session: s } = await processMessage(session, 'mujhe discord nahi pata');
  assert.match(reply, /play\.google\.com\/store\/apps\/details\?id=com\.discord/); // INTENT_11 setup guide shown
  assert.equal(s.state, 'awaiting_discord'); // flow preserved after help
});

test('RUTHLESS: universal cancel works from awaiting_confirm', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567');
  await processMessage(session, 'ali_raza'); // → awaiting_confirm
  const before = submissions.length;
  const { reply, session: s } = await processMessage(session, 'i dont want to apply anymore');
  assert.equal(s.state, 'done');
  assert.equal(submissions.length, before); // nothing new submitted
});

test('INTENT_11 (Discord guidance) includes the video link', () => {
  assert.ok(/youtu\.be\//.test(INTENTS[10].reply));
});

test('INTENT_10 (pitch) includes the WhatsApp-vs-Discord explanation', () => {
  assert.match(INTENTS[9].reply, /WhatsApp/);
});

// ---- Conversation-flow stress tests: attack the bot mid-process ----

test('FLOW: security concern while asked for name is reassured and name re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes'); // → awaiting_name
  const { reply, session: s } = await processMessage(session, 'mujhe security concerns hain');
  assert.ok(reply.startsWith(INTENTS[2].reply)); // INTENT_03 trust script
  assert.match(reply, /name|naam/i); // name re-asked
  assert.equal(s.state, 'awaiting_name'); // flow preserved
  assert.equal(s.name, null); // not stored as a name
});

test('FLOW: security concern while asked for phone is reassured and phone re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza'); // → awaiting_phone
  const { reply, session: s } = await processMessage(session, 'is my data safe with you?');
  assert.ok(reply.startsWith(INTENTS[2].reply)); // INTENT_03 trust script
  assert.match(reply, /number|phone/i); // phone re-asked
  assert.equal(s.state, 'awaiting_phone');
});

test('FLOW: job details asked while collecting phone are answered, phone re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza'); // → awaiting_phone
  setIntent('provide_info');
  groundedResult = { text: 'Data Entry: Work from home doing data entry.' };
  const { reply, session: s } = await processMessage(session, 'data entry kya hai?');
  assert.equal(reply, INTENTS[9].reply + '\n\n' + RULES.askPhone); // EXACT INTENT_10 + phone re-ask
  assert.equal(s.state, 'awaiting_phone'); // flow preserved
  assert.equal(s.phone, null); // not polluted
});

test('FLOW: sentiment "thanks" while collecting discord gets warm reply + discord re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567'); // → awaiting_discord
  const { reply, session: s } = await processMessage(session, 'thank you so much');
  assert.match(reply, /welcome|shukriya/i); // warm reply
  assert.match(reply, /discord/i); // discord re-asked
  assert.equal(s.state, 'awaiting_discord'); // flow preserved
});

test('FLOW: job question at confirm is answered and confirm re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567');
  await processMessage(session, 'ali_raza'); // → awaiting_confirm
  setIntent('provide_info');
  groundedResult = { text: 'Amazon FBA: Work from home with Amazon FBA.' };
  const { reply, session: s } = await processMessage(session, 'amazon fba kya hai?');
  assert.equal(reply, INTENTS[9].reply + '\n\n' + RULES.confirmPrompt); // EXACT INTENT_10 + confirm re-ask
  assert.equal(s.state, 'awaiting_confirm'); // flow preserved
  assert.equal(s.job, 'Amazon FBA');
});

test('FLOW: full application survives a barrage of side questions', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes'); // → awaiting_name
  // Attack the name step.
  setIntent('provide_info');
  groundedResult = { text: 'Graphic Designer: Work from home as a graphic designer.' };
  await processMessage(session, 'graphic design kya hai?'); // side question
  await processMessage(session, 'is it safe?'); // security concern
  await processMessage(session, 'Ali Raza'); // actual name
  assert.equal(session.state, 'awaiting_phone');
  assert.equal(session.name, 'Ali Raza');
  // Attack the phone step.
  setIntent('out_of_scope');
  groundedResult = { outOfScope: true };
  await processMessage(session, 'how much can i earn?'); // knowledge question
  assert.equal(session.state, 'awaiting_phone');
  await processMessage(session, 'thank you'); // sentiment
  assert.equal(session.state, 'awaiting_phone');
  await processMessage(session, '03001234567'); // actual phone
  assert.equal(session.state, 'awaiting_discord');
  assert.equal(session.phone, '03001234567');
  // Attack the discord step.
  await processMessage(session, 'ali_raza'); // actual discord
  assert.equal(session.state, 'awaiting_confirm');
  const before = submissions.length;
  await processMessage(session, 'yes'); // submit
  assert.equal(session.state, 'done');
  assert.equal(submissions.length, before + 1); // exactly one submission
  assert.equal(session.name, 'Ali Raza');
  assert.equal(session.phone, '03001234567');
  assert.equal(session.discord, 'ali_raza');
});

test('FLOW: "no thanks" mid-field backs out, not a sentiment reply', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567'); // → awaiting_discord
  const { reply, session: s } = await processMessage(session, 'no thanks');
  assert.equal(s.state, 'done'); // backed out
  assert.match(reply, /problem|masla|change your mind|dil kare|no problem/i);
  assert.doesNotMatch(reply, /welcome|shukriya/i); // not a "you're welcome"
});

test('FLOW: "no problem" mid-field does NOT close the application', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'yes');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567'); // → awaiting_discord
  const { session: s } = await processMessage(session, 'no problem');
  assert.equal(s.state, 'awaiting_discord'); // flow preserved
});

// ---- NEW SCENARIOS: full job details, job lists, interest handling, field guards ----

test('JOB DETAILS: asking about a job gives the EXACT INTENT_10 script, not a redirect', async () => {
  setIntent('provide_info');
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'what is data entry?');
  assert.equal(reply, INTENTS[9].reply); // EXACT INTENT_10 script, nothing extra
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.equal(s.job, 'Data Entry');
});

test('JOB DETAILS: every job in the list has a name and emoji (the PDF gives no per-job detail)', () => {
  const { JOBS } = require('../src/knowledge/base');
  assert.equal(JOBS.length, 10);
  for (const job of JOBS) {
    assert.ok(typeof job.name === 'string' && job.name.length > 0, `${JSON.stringify(job)} needs a name`);
    assert.ok(typeof job.emoji === 'string' && job.emoji.length > 0, `${job.name} needs an emoji`);
  }
});

test('JOB LIST: "which jobs are available" lists ALL jobs deterministically', async () => {
  setIntent('out_of_scope'); // even if the classifier fails
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'which jobs are available?');
  assert.match(reply, /Video Watch and Earn/);
  assert.match(reply, /Assignment Writing/);
  assert.match(reply, /Content Writing/);
  assert.match(reply, /Graphic Designer/);
  assert.match(reply, /Travel and Booking Support/);
  assert.match(reply, /Video Editing Job/);
  assert.match(reply, /Digital Marketing/);
  assert.match(reply, /Data Entry/);
  assert.match(reply, /Amazon Virtual Assistant/);
  assert.match(reply, /Amazon FBA/);
  assert.equal(s.state, 'awaiting_interest'); // nudged toward interest
});

test('JOB LIST: Hinglish "konsi jobs hain" lists ALL jobs in Hinglish', async () => {
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'konsi jobs available hain?');
  assert.equal(s.lang, 'hi');
  assert.match(reply, /Video Watch and Earn/);
  assert.match(reply, /Amazon FBA/);
  assert.match(reply, /jobs available hain/);
  assert.equal(s.state, 'awaiting_interest');
});

test('JOB LIST: "jobs" alone lists all jobs', async () => {
  const session = fresh();
  const { reply } = await processMessage(session, 'jobs');
  assert.match(reply, /Video Watch and Earn/);
  assert.match(reply, /Amazon FBA/);
});

test('JOB LIST: asked while collecting a field answers and re-asks the field', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan'); // → awaiting_name
  const { reply, session: s } = await processMessage(session, 'what jobs do you have?');
  assert.match(reply, /Video Watch and Earn/); // list answered
  assert.match(reply, /name|naam/i); // field re-asked
  assert.equal(s.state, 'awaiting_name');
  assert.equal(s.name, null);
});

test('INTEREST: "i am interested" from idle goes straight to pitch', async () => {
  setIntent('out_of_scope');
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'i am interested');
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.match(reply, /WhatsApp/);
});

test('INTEREST: "mein interested hu" from idle goes to Hinglish pitch', async () => {
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'mein interested hu');
  assert.equal(s.lang, 'hi');
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.match(reply, /WhatsApp/); // INTENT_10 pitch
  assert.match(reply, /Discord account banana parega/); // INTENT_10 transition line
});

test('INTEREST: "i am interested in data entry" names the job and pitches', async () => {
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'i am interested in data entry');
  assert.equal(s.job, 'Data Entry');
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.equal(reply, INTENTS[9].reply); // EXACT INTENT_10 script
});

test('INTEREST: "interested" while asked for name is never stored as a name', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan'); // → awaiting_name
  const { reply, session: s } = await processMessage(session, 'interested');
  assert.equal(s.state, 'awaiting_apply_decision'); // went to pitch, not stored
  assert.equal(s.name, null);
  assert.match(reply, /WhatsApp/);
});

test('INTEREST: "mein interested hu" mid-phone answers with pitch, phone not stored', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'Ali Raza'); // → awaiting_phone
  const { reply, session: s } = await processMessage(session, 'haan main interested hu');
  assert.equal(s.lang, 'hi');
  assert.equal(s.state, 'awaiting_apply_decision'); // pitch
  assert.equal(s.phone, null);
  assert.match(reply, /WhatsApp/);
});

test('INTEREST: "i want to apply" while asked for phone captures job, phone re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'Ali Raza'); // → awaiting_phone
  const { reply, session: s } = await processMessage(session, 'i want to apply for data entry');
  assert.equal(s.state, 'awaiting_phone'); // flow preserved
  assert.equal(s.job, 'Data Entry');
  assert.equal(s.phone, null);
  assert.equal(reply, INTENTS[9].reply + '\n\n' + RULES_HI.askPhone); // EXACT INTENT_10 + Hinglish phone re-ask
});

test('INTEREST: "main apply karna chahta hoon" at confirm re-asks confirm, no submission', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567');
  await processMessage(session, 'ali_raza'); // → awaiting_confirm
  const before = submissions.length;
  const { reply, session: s } = await processMessage(session, 'main apply karna chahta hoon');
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.equal(submissions.length, before); // not submitted by an interest statement
  assert.match(reply, /WhatsApp/);
});

test('LANG: Hinglish apply → Hinglish pitch (INTENT_10 + apply ask)', async () => {
  setIntent('apply');
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'haan, main apply karna chahata hoon');
  assert.equal(s.lang, 'hi');
  assert.equal(s.state, 'awaiting_apply_decision');
  assert.ok(reply.startsWith(INTENTS[9].reply)); // INTENT_10 pitch
  assert.match(reply, /apply karne mein interested/i); // Hinglish apply ask
});

test('LANG: English interest while collecting name keeps the bot in English', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'haan, main apply karna chahata hoon'); // → hi
  await processMessage(session, 'yes'); // → awaiting_name (Hinglish askName)
  const { reply, session: s } = await processMessage(session, 'Ali Raza'); // name
  assert.equal(s.lang, 'hi'); // name typed in English letters does NOT flip to en
  assert.match(reply, /number|phone/i); // still Hinglish askPhone
});

test('FIELD: greeting "hi" while asked for name is not stored as the name', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan'); // → awaiting_name
  const { reply, session: s } = await processMessage(session, 'hi');
  assert.equal(s.state, 'awaiting_name'); // still asking
  assert.equal(s.name, null); // "hi" not stored
  assert.match(reply, /name|naam/i); // re-ask
});

test('FIELD: "yes" while asked for name is not stored as the name', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan'); // → awaiting_name
  const { reply, session: s } = await processMessage(session, 'yes');
  assert.equal(s.state, 'awaiting_name'); // still asking
  assert.equal(s.name, null);
  assert.match(reply, /name|naam/i);
});

test('FIELD: sentiment "how are you" while asked for phone re-asks phone', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'Ali Raza'); // → awaiting_phone
  const { reply, session: s } = await processMessage(session, 'how are you?');
  assert.equal(s.state, 'awaiting_phone'); // flow preserved
  assert.equal(s.phone, null);
  assert.match(reply, /number|phone/i);
});

test('FIELD: "what is this job about" mid-name is answered, name re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan'); // → awaiting_name
  setIntent('provide_info');
  groundedResult = { text: 'Data Entry: Work from home doing data entry.' };
  const { reply, session: s } = await processMessage(session, 'what is this job about?');
  assert.equal(s.state, 'awaiting_name'); // flow preserved
  assert.equal(s.name, null);
  assert.match(reply, /name|naam/i); // name re-asked
});

test('FIELD: irrelevant question mid-phone re-asks phone, not stored', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'Ali Raza'); // → awaiting_phone
  setIntent('out_of_scope');
  groundedResult = { outOfScope: true };
  const { reply, session: s } = await processMessage(session, 'who is the president?');
  assert.equal(s.state, 'awaiting_phone'); // flow preserved
  assert.equal(s.phone, null);
});

test('FIELD: job changed at confirm captures the new job, confirm re-asked', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'Ali Raza');
  await processMessage(session, '03001234567');
  await processMessage(session, 'ali_raza'); // → awaiting_confirm
  const before = submissions.length;
  const { reply, session: s } = await processMessage(session, 'video editing job karna hai');
  assert.equal(s.job, 'Video Editing Job'); // job captured
  assert.equal(s.state, 'awaiting_confirm'); // flow preserved — confirm re-asked
  assert.equal(submissions.length, before); // not submitted by an interest statement
  assert.equal(reply, INTENTS[9].reply + '\n\n' + RULES_HI.confirmPrompt); // EXACT INTENT_10 + Hinglish confirm re-ask
});

test('FIELD: "which job am i applying for" mid-phone answers and re-asks phone', async () => {
  setIntent('apply');
  const session = fresh();
  await processMessage(session, 'i want to apply');
  await processMessage(session, 'haan');
  await processMessage(session, 'i am interested in graphic designer'); // → pitch → yes
  await processMessage(session, 'haan'); // → awaiting_name
  await processMessage(session, 'Ali Raza'); // → awaiting_phone
  const { reply, session: s } = await processMessage(session, 'which job am i applying for?');
  assert.equal(s.state, 'awaiting_phone');
  assert.equal(s.phone, null);
  assert.match(reply, /Graphic Designer/); // answers which job
  assert.match(reply, /number|phone/i); // phone re-asked
});

test('ENGLISH: english question in a fresh session is answered in english, not redirected', async () => {
  const session = fresh();
  const { reply, session: s } = await processMessage(session, 'what is the salary?');
  assert.equal(s.lang, 'en'); // session stays English
  assert.match(reply, /Easypaisa|payout|payment/i); // INTENT_04 payment answer (not a redirect)
  assert.doesNotMatch(reply, /can only|sirf hamari|website/i); // never redirected
});
