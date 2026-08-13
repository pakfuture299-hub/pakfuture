# Test Report — PDF-Exact Intent Replies

Date: 2026-08-13
Scope: `Job_Portal_Bot_System_Architecture.pdf` is the **only** knowledge base. Every reply the bot gives to a knowledge question is the PDF's exact response script — byte-for-byte, nothing added (the only additions are the guided-flow's own questions: the apply ask, field re-asks, and the invite link on submission).

## Bugs found (user reports) and fixes

| # | Reported issue | Root cause | Fix | Applied |
|---|---|---|---|---|
| 1 | `info` returned "I can only assist you with our jobs..." | INTENT_01 (welcome) was treated as a flow intent, not dispatched deterministically; with the AI classifier unavailable/misclassifying it fell through to the redirect | INTENT_01 now resolves deterministically in the matcher and returns the exact PDF welcome script | ✅ |
| 2 | `kaun sa kaam hai` (jobs list) sometimes wrong | The AI classifier was relied on; it could mislabel | INTENT_02 resolves deterministically; every trigger keyword is covered | ✅ |
| 3 | `timing kia hai` (timings) returned hiring-process / repeated old replies | The PDF trigger is `job timing kia hain`; the singular `timing kia hai` wasn't a literal trigger, so it fell through to stale flow logic | Added the singular/common timing phrasings to INTENT_06 triggers | ✅ |
| 4 | `qualification chahiye` returned "Zabardast! Aap ka selection..." (INTENT_10 pitch) | The broad `isInterested` heuristic matched the bare word `chahiye` and misrouted to the job-selection pitch | Tightened `isInterested` to require a genuine self-directed apply/interest phrase; intent triggers fire first | ✅ |
| 5 | Chatbot repeated previous responses for different questions | Short trigger `hi` matched as a **substring** inside "nahi"/"chahiye", so messages containing those words were misclassified | Matcher now uses **word-boundary** matching — a trigger must match as whole words, never inside a longer word | ✅ |
| 6 | `hi` / `hello` returned the redirect | Same as #1 | Fixed with #1 | ✅ |
| 7 | Stuck `done` state after submission | The deterministic intent handlers ran before the done-state reset, so a post-submission greeting stayed in `done` | `done` state resets to `idle` at the very top of `processMessage`, before intent dispatch | ✅ |
| 8 | Tests passed locally but production failed | Tests stubbed the AI as "greeting" (too lenient), hiding the failure path | All intent/scenario tests now stub the AI as the **worst case** (`out_of_scope`) so the deterministic matcher is proven correct even when OpenAI fails | ✅ |
| 9 | `fees?` (or any single trigger word used loosely in a sentence) returned the redirect | Only exact trigger phrases matched; a bare keyword like `fees` in a sentence ("fees?", "koi fees lagti hai?") didn't hit any phrase trigger | Added a **keyword layer** to the matcher: distinctive whole-word keywords (`fees`, `salary`, `timing`, `office`, `qualification`, `scam`, etc.) resolve to their intent even when used loosely in a sentence. Runs only after the phrase layer (existing behaviour unchanged), and deliberately excludes flow intents + ambiguous words (`pata` — "don't know" — must not trigger office-location) | ✅ |

## What was tested

All tests run with the AI stubbed to the worst case (returns `out_of_scope` — exactly what happens when OpenAI misclassifies or is down). The bot must answer correctly regardless.

- **`tests/intents.test.js`** (7 tests) — every trigger keyword of every intent → exact PDF script; sentence variations; word-boundary no-false-positive checks; user-reported regression cases.
- **`tests/scenarios.test.js`** (8 tests) — full PDF scenario sweep (all 12 intents × every trigger), mid-field side questions (flow never lost), full guided flow with mid-flow safety question → Google Sheet contract, all 10 jobs resolve + capture, done-state reset, out-of-PDF redirect, **keyword-layer loose-trigger cases + ambiguous-word no-false-positive cases**.
- **`tests/flow.test.js`** (75 tests) — the guided apply state machine.
- **`tests/app.test.js` / `store.test.js` / `validation.test.js`** — HTTP, store, validation.
- **Total: 111 tests, 0 failures.**

## What the chatbot returns (verified output)

| User says | Chatbot replies (exact PDF script, first line shown) |
|---|---|
| `info` / `hi` / `hello` | "Welcome to Job Portal Global! 🌐" (INTENT_01) |
| `konsi jobs hain?` / `kaun sa kaam hai` | "Hamare paas is waqt kul 10 remote jobs available hain: 🚀" (INTENT_02) |
| `real hai ya fake` / `is it safe?` | "Job Portal Global ek fully verified aur professional platform hai. 🛡️..." (INTENT_03) |
| `salary kitni milegi` / `how much can i earn?` | "Hamari tamam payments verified local payment gateways (Easypaisa 💳...)" (INTENT_04) |
| `apply kaise karna hai` / `job chahiye` | "Job Portal Global par hiring process bohot aasan hai. 🎯..." (INTENT_05) |
| `timing kia hai` / `working hours` | "Hamare portal par flexible timings hain! ⏰..." (INTENT_06) |
| `apka office kaha hai` / `where is your office` | "Job Portal Global ek centralized remote digital platform hai. 🌐..." (INTENT_07) |
| `qualification chahiye` / `do i need experience` | "Is kaam ke liye kisi high qualification... nahi hai. 🎓..." (INTENT_08) |
| `fees hai` / `is there a fee` | "Job Portal Global par application process aur registration policy..." (INTENT_09) |
| `fees?` / `koi fees lagti hai?` | Same INTENT_09 fees answer (loose keyword in a sentence) |
| `data entry` / `graphic design` / `yeh job chahiye` | "Zabardast! Aap ka selection bohot behtareen hai. 🎉..." (INTENT_10) |
| `telegram nahi pata` / `guide karo` | "No problem at all! Main abhi aap ko setup mein complete guidance..." (INTENT_11) |
| `telegram account done` / `account setup kar liya hai` | "Zabardast! Welldone. 👏✨... 👉 https://t.me/+923244362726" (INTENT_12) |
| Anything outside the PDF | Redirect: "I can only assist you with our jobs and applications..." |

## Files changed

- `src/services/intents.js` — word-boundary matcher (fixed the `hi`-inside-`nahi` bug)
- `src/services/flow.js` — all 12 intents dispatch deterministically first; tightened `isInterested`; `done`-state reset before intent dispatch; field re-asks preserve the flow
- `src/knowledge/base.js` — added natural sentence variants (English + Hinglish) to INTENT_06/08 (and earlier: 03/04/05/07/09/10)
- `tests/intents.test.js` — strengthened (worst-case AI stub, boundary + regression cases)
- `tests/scenarios.test.js` — NEW comprehensive PDF scenario sweep

## How to verify on the VPS

```bash
cd /opt/job-portal-chatbot
git pull
npm ci --omit=dev
sudo systemctl restart job-portal-chatbot
curl http://localhost:3000/health
```
