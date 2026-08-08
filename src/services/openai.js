/**
 * OpenAI (ChatGPT API) integration.
 *
 * Two responsibilities:
 *  1. `classifyIntent` — a strict, low-latency call that decides how the
 *     conversation engine should treat a user message. The model is forced
 *     to answer with the exact JSON schema below (nothing else), which keeps
 *     latency low and parsing deterministic.
 *  2. `askGrounded` — answers questions ONLY from the bundled knowledge base
 *     (the "PDF" of the site). Anything outside the knowledge base produces
 *     an `out_of_scope` reply that redirects the candidate to the website.
 *
 * Uses the OpenAI Chat Completions REST endpoint via global fetch — no SDK
 * needed. The model is instructed to emit a JSON object for classification;
 * see https://platform.openai.com/docs/api-reference/chat/create
 */

const config = require('../config');
const { withTimeout } = require('../utils/http');
const { STORE, JOBS, FAQ } = require('../knowledge/base');
const { loadStoreContent } = require('../knowledge/loader');
const logger = require('../utils/logger');

/** Intent schema the model must return. */
const INTENT_SCHEMA = {
  intent: {
    description: 'One of: greeting, telegram_help, apply, provide_info, out_of_scope',
    enum: ['greeting', 'telegram_help', 'apply', 'provide_info', 'out_of_scope'],
  },
  telegram_help_requested: { type: 'boolean' },
};

const SYSTEM_PROMPT = `You are the recruitment assistant for ${STORE.name} (${STORE.url}), a platform that hires daily for online work-from-home jobs and pays in PKR. All communication with candidates happens on Telegram.

YOUR JOB: Classify the candidate's message. Reply with ONLY a single JSON object, no markdown, no prose:

{
  "intent": "<greeting|telegram_help|apply|provide_info|out_of_scope>",
  "telegram_help_requested": true|false
}

Rules:
- "greeting" — hello, hi, salam, good morning and other normal small talk. Also greetings mentioning the store name.
- "telegram_help" — the candidate says they do NOT have Telegram, cannot access Telegram, or asks how to install/set up Telegram. Set telegram_help_requested: true.
- "apply" — the candidate wants to apply for a job, start the application, register, join, or submit their name/phone/telegram details.
- "provide_info" — the candidate asks questions about the jobs, platform, how to apply, earnings, requirements, or anything else that the knowledge base covers (see knowledge below).
- "out_of_scope" — EVERYTHING else: any question whose answer is not in the knowledge base, such as refunds, shipping, product orders, discounts/coupons, unrelated topics, political questions, coding questions, etc. Do not improvise.`;

const KNOWLEDGE_COMPACT = `
STORE: ${STORE.name} — ${STORE.tagline} — Mission: ${STORE.mission}
Why choose us: ${STORE.whyChooseUs.join(' | ')}
JOBS (all online, work from home, Rs.0.00 to apply):
${JOBS.map((j) => `- ${j.name}${j.summary ? ': ' + j.summary : ''}`).join('\n')}
FAQ:
${FAQ.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n')}
`;

// The full scraped storefront content — the same source the PDF is built
// from. Lets the bot walk a candidate through every job in detail. Loaded at
// boot; empty string if the scrape artifact is missing (falls back to the
// curated content above).
const STORE_CONTENT = loadStoreContent();

const GROUNDING_PROMPT = `You are the recruitment assistant for ${STORE.name} (${STORE.url}). You hire daily for online work-from-home jobs; all communication happens on Telegram.

RULES:
1. Answer ONLY from the knowledge provided below. Never invent facts, prices, guarantees, or timelines that are not in it.
2. Keep answers short, friendly and professional (2-4 sentences). If the candidate asks about a specific job, walk them through what that job involves, its requirements and how to apply — all of that is in the knowledge.
3. If a question is NOT answerable from the knowledge, reply with exactly:
   OUT_OF_SCOPE
   (the system will then redirect the candidate to the website).
4. Never ask for personal data yourself. If the user asks to apply or gives details, reply with exactly:
   APPLY_FLOW
5. If the user asks how to install Telegram or says they don't have it, reply with exactly:
   TELEGRAM_HELP
6. For greetings and small talk, reply briefly in a friendly way.

LANGUAGE: Reply in the same language the candidate uses. If they write in English, answer in English. If they write in Roman Urdu / Hinglish (e.g. "video watch and earn kya hai?"), answer in friendly Roman Urdu / Hinglish, not English. Match their language.

KNOWLEDGE (this is the complete PDF of the website):
${KNOWLEDGE_COMPACT}

FULL STOREFRONT CONTENT (also part of the PDF — use it for detailed job walkthroughs):
${STORE_CONTENT}
`;

/**
 * Call the OpenAI Chat Completions API with a system + user prompt pair.
 * Returns the model's raw text reply.
 */
async function generate(systemPrompt, message, temperature = 0) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const response = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        temperature,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      }),
    }),
    config.openai.timeoutMs
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  return text.trim();
}

/** Parse the model's JSON reply defensively (it can wrap in code fences). */
function parseJsonObject(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('OpenAI returned unparseable JSON');
  }
}

/**
 * Classify a candidate message into a conversation intent.
 * Falls back to `out_of_scope` when the model call fails — better to redirect
 * than to hallucinate an answer.
 */
async function classifyIntent(message) {
  try {
    const raw = await generate(SYSTEM_PROMPT, message, 0);
    const parsed = parseJsonObject(raw);
    const valid = ['greeting', 'telegram_help', 'apply', 'provide_info', 'out_of_scope'];
    if (!valid.includes(parsed.intent)) {
      throw new Error(`Unknown intent: ${parsed.intent}`);
    }
    return {
      intent: parsed.intent,
      telegramHelpRequested: parsed.telegram_help_requested === true,
    };
  } catch (err) {
    logger.warn('Intent classification failed, defaulting to out_of_scope', {
      err: err.message,
      message: String(message).slice(0, 120),
    });
    return { intent: 'out_of_scope', telegramHelpRequested: false };
  }
}

/**
 * Grounded answering: the model can only use the knowledge base.
 * Returns { text } or { outOfScope: true } or { applyFlow: true } or
 * { telegramHelp: true } sentinels handled by the conversation engine.
 * @param {string} message the candidate's message
 * @param {'en'|'hi'} [lang] detected language — nudges the model to reply in kind
 */
async function askGrounded(message, lang = 'en') {
  try {
    const userPrompt =
      lang === 'hi'
        ? `${message}\n\n(Reply in Roman Urdu / Hinglish, not English.)`
        : message;
    const raw = await generate(GROUNDING_PROMPT, userPrompt, 0.3);
    const trimmed = raw.trim();
    if (trimmed.toUpperCase().startsWith('OUT_OF_SCOPE')) return { outOfScope: true };
    if (trimmed.toUpperCase().startsWith('APPLY_FLOW')) return { applyFlow: true };
    if (trimmed.toUpperCase().startsWith('TELEGRAM_HELP')) return { telegramHelp: true };
    return { text: raw };
  } catch (err) {
    logger.error('Grounded answer failed', { err: err.message });
    return { outOfScope: true };
  }
}

module.exports = { classifyIntent, askGrounded, INTENT_SCHEMA };
