# 🤖 Job Portal Global — Recruitment Chat Widget

Interactive AI chat widget for **JOB PORTAL GLOBAL 2** (`https://job-portal-global-2.myshopify.com/`), running on a VPS.

A floating chat bubble on the Shopify storefront answers visitor questions using OpenAI (grounded in the site's knowledge base), then hands every candidate the single **Telegram invite link** where the hiring team takes over.

```
Visitor on Shopify storefront
        │  "how do I apply?" 👋
        ▼
┌─────────────────────┐     OpenAI (intent + grounded answers,
│  Chatbot Backend     │     knowledge base = the site "PDF")
│  (Node.js on VPS)    │
└──────────┬──────────┘
           │ reply + Telegram invite link
           ▼
     Visitor joins:  https://t.me/+923244362726
```

---

## Features

| Requirement | Implementation |
|---|---|
| Interactive AI chat | OpenAI intent classification + grounded answers from the bundled knowledge base |
| Knowledge guardrail | OpenAI answers **only** from the knowledge base (the "PDF" of the site); off-topic → friendly redirect to website + Telegram link |
| Single goal | Every relevant intent ends with the Telegram invite link |
| No backend sessions | Stateless `/api/chat` — every message gets a reply immediately |
| Spam prevention | Per-IP rate limiting on `/api/chat` |
| Logging | Structured JSON logs in production, pretty in dev |
| Timeout protection | Hard timeout on OpenAI calls so the widget never hangs |
| 1,000+ chats/day | Stateless Express API, scales horizontally behind a load balancer |

---

## Project structure

```
.
├── .env.example              # every variable, documented
├── scripts/
│   ├── scrape-store.js       # fetch live store → knowledge/store-scrape.md
│   ├── generate-pdf.js       # markdown → knowledge/PDFs/store-content.pdf
│   └── check-env.js          # boot-time env validation
├── knowledge/
│   ├── store-scrape.md       # source of truth (scraped store content)
│   └── PDFs/store-content.pdf  # the PDF deliverable
├── src/
│   ├── server.js             # boot: config → HTTP → shutdown
│   ├── app.js                # Express app (health, /api/chat, /widget)
│   ├── config/index.js       # env config with fail-fast required vars
│   ├── knowledge/base.js     # ⭐ curated rules, pitch, bilingual flow copy
│   ├── knowledge/loader.js   # loads store-scrape.md for the bot at boot
│   ├── services/
│   │   ├── flow.js           # ⭐ guided apply state machine (transport-agnostic)
│   │   ├── chat.js           # storefront chat → flow (session by sessionId)
│   │   ├── conversation.js   # Telegram webhook → flow (session by chat id)
│   │   ├── openai.js         # OpenAI intent classification + grounded answers
│   │   ├── submission.js     # candidate → n8n (duplicate detection)
│   │   └── n8n.js            # async delivery to n8n with retries
│   ├── store/index.js        # in-memory sessions + rate limiting
│   └── utils/                # validation, http retry, logger
├── public/widget.js          # the storefront widget injector (loaded by the Shopify page)
├── public/widget.html        # local preview page for the widget (npm run dev → /widget)
├── deploy/vps-deploy.sh      # Ubuntu VPS: systemd + Caddy + Node
└── tests/                    # node:test unit + smoke tests
```

---

## Conversation flow

The widget now runs a **guided apply flow** (a multi-step conversation, not just a link hand-off):

1. **Open** — visitor clicks the floating bubble; a friendly greeting appears.
2. **Pitch** — the bot explains the team hires daily and that all work happens on Telegram (including the "why Telegram, not WhatsApp" explanation).
3. **Ask: do you have Telegram?**
   - **No** → the bot guides setup step-by-step: Proton VPN link → Telegram app link → a YouTube setup tutorial → then proceeds.
   - **Yes** → proceeds straight away.
4. **Collect details** — Name → Contact Number → Telegram username/number, each validated, with a confirm step before submitting.
5. **Submit** — the application is POSTed to n8n → Google Sheets, and the team contacts the candidate on Telegram.

**Bilingual**: replies are English by default, but if the candidate writes in Roman Urdu/Hinglish (e.g. "haan main apply karna chahata hoon") the bot switches to Hinglish and stays in that language for the rest of the flow.

**Questions about jobs** (e.g. "what does video watch and earn involve?") are answered from the knowledge base — the full scraped storefront content — so the bot can walk a candidate through any of the 10 job categories in detail. Anything out of scope gets a friendly redirect to the website.

### Out-of-scope guardrail

Everything **not** in the knowledge base — refunds, shipping, orders, discounts, unrelated topics — gets a friendly redirect to the website, never an improvised answer.

---

## PDF knowledge deliverable

The store's content (homepage + all 10 job pages) is scraped from the live storefront and turned into a PDF. The **same source** feeds the bot, so the answers always match the PDF.

```bash
npm run build:knowledge   # scrape the store → generate the PDF
```

Outputs:
- `knowledge/store-scrape.md` — the source-of-truth markdown (loaded by the bot at boot).
- `knowledge/PDFs/store-content.pdf` — the PDF deliverable.

`pdfkit` is a devDependency only — the runtime/deploy is untouched. To regenerate after the store changes: `npm run build:knowledge`, commit the two artifacts, push.

---

## Running n8n on a VPS without a domain

The recruitment automation (webhook → Google Sheets → Telegram admin) runs 24/7 on the VPS with **no domain needed**. n8n binds to `127.0.0.1:5678` — only the chatbot backend on the same machine calls it, so nothing is exposed publicly. You reach the n8n editor through an SSH tunnel.

### 1. Run the one-shot setup

On the VPS (as root):

```bash
# edit deploy/n8n-vps-setup.sh first: ADMIN_PASSWORD, ENCRYPTION_KEY,
# DB_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID
sudo bash deploy/n8n-vps-setup.sh
```

This installs Docker, writes `/opt/n8n/docker-compose.yml`, and starts n8n + PostgreSQL with `restart: unless-stopped` (auto-restarts on reboot/crash).

### 2. Open the n8n editor via SSH tunnel

```bash
ssh -L 5678:127.0.0.1:5678 root@169.58.108.226
# then browse to http://localhost:5678
```

### 3. Configure n8n

1. Log in with the admin user/password from the setup script.
2. **Settings → Credentials → Add**:
   - **Google** — authorize access to your target spreadsheet (OAuth).
   - **Telegram** — paste the bot token from @BotFather.
3. **Import** `n8n/recruitment-workflow.json`:
   - Set `YOUR_GOOGLE_SHEET_ID` in the **Append to Google Sheets** node (the long id from your spreadsheet URL).
   - Attach the Google credential to that node and the Telegram credential to **Notify Admin Group**.
4. Toggle the workflow **Active**.

### 4. Test the pipeline

```bash
sudo bash deploy/n8n-test-webhook.sh   # POSTs a fake candidate to the webhook
```

Expect a new row in the sheet **and** a "New Candidate" message in the admin Telegram group. If the Telegram message doesn't arrive, the most common cause is a wrong `TELEGRAM_ADMIN_CHAT_ID` (must be the numeric id, usually starting with `-100…` for groups).

### Keeping it running

- `restart: unless-stopped` handles reboots. Verify with:
  ```bash
  docker ps                    # both n8n and postgres Up
  docker compose -f /opt/n8n/docker-compose.yml logs -f n8n
  ```
- The chatbot backend connects to `http://127.0.0.1:5678/webhook/recruitment` — set `N8N_WEBHOOK_URL` accordingly in its `.env`.

---

## Setup (local)

```bash
git clone <your-repo> && cd job-portal-chatbot
npm install
cp .env.example .env        # fill in real values
node scripts/check-env.js   # validates every variable
npm run dev                 # starts the API + widget on :3000
```

The **only** required environment variable is `OPENAI_API_KEY`. `INVITE_LINK` defaults to the Telegram invite link.

Test locally: open `http://localhost:3000/widget` and chat with the widget directly.

---

## Deploy to a VPS

`deploy/vps-deploy.sh` covers Ubuntu 22.04/24.04: Node 22, clone, `.env`, systemd unit (`Restart=always`), and a Caddy reverse proxy with auto-HTTPS.

```bash
sudo bash deploy/vps-deploy.sh   # then fill .env and start the service
```

### Making the widget public (HTTPS)

The widget runs **on the Shopify storefront origin itself** — it is served from a Shopify page on `https://job-portal-global-2.myshopify.com`, so the browser allows it to call the backend (same-origin CORS). The backend stays on the VPS behind a free Cloudflare tunnel.

1. **Point the backend CORS at the store** — in the VPS `.env`, set:
   ```
   ALLOWED_ORIGINS=https://job-portal-global-2.myshopify.com
   ```
   then restart: `sudo systemctl restart job-portal-chatbot`.

2. **Create a Shopify page for the widget** — Shopify admin → **Online Store → Pages → Add page**:
   - Title: `Chat Widget`
   - Handle: `chat-widget`
   - Body: exactly one line:
     ```html
     <script src="https://pakfuture299-hub.github.io/pakfuture/widget.js"></script>
     ```
   - Save, then open `https://job-portal-global-2.myshopify.com/pages/chat-widget` — the bubble appears bottom-left.

3. **Show the widget on every page (recommended)** — Shopify admin → **Online Store → Themes → ⋯ → Edit code**, and in `layout/theme.liquid` right before `</body>` add the same single line:
   ```html
   <script src="https://pakfuture299-hub.github.io/pakfuture/widget.js"></script>
   ```
   That's the only theme change — a bare `<script src>` tag, no Liquid braces, no iframe. Nothing else on the store is touched.

> The widget's `widget.js` lives on GitHub Pages (`public/` → push to `main` auto-deploys) and injects the bubble + chat window directly into the page — there is no iframe and no postMessage sizing. The chat backend is discovered by pinging the tunnel's `/health`; if the tunnel is down the widget shows a clear error instead of failing silently.

### When the tunnel restarts

Free `trycloudflare` URLs are ephemeral — they change on VPS reboot or `cloudflared` restart. The backend URL is one constant at the top of `public/widget.js` (and `public/widget.html`):

1. Restart the tunnel and copy the new URL: `cloudflared tunnel --url http://localhost:3000`
2. Verify it: `curl https://<new-url>.trycloudflare.com/health`
3. Update `API_BASE` in `public/widget.js` and `public/widget.html` to the new URL.
4. Commit + push to `main` — GitHub Pages redeploys in ~90 seconds.

---

## Environment variables

See `.env.example` for the full documented list. Secrets used:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI Chat Completions calls (**required**) |
| `OPENAI_MODEL` | Model id, default `gpt-4o-mini` |
| `INVITE_LINK` | The Telegram invite link the widget hands out |
| `ALLOWED_ORIGINS` | Comma-separated storefront origins allowed to call `/api/chat` |
| `RATE_LIMIT_PER_MINUTE` | Max messages per IP per minute on `/api/chat` |

---

## Testing

```bash
npm test    # unit + smoke tests (validation, /api/chat, HTTP)
```

## Scaling to 1,000+ chats/day

- The API is stateless — run multiple instances behind a load balancer; swap `src/store/index.js` for a Redis-backed store (same API) when you grow.
- The `/api/chat` endpoint never blocks — OpenAI calls have a hard timeout, and replies are returned immediately.
- Per-IP rate limiting keeps a single visitor from hammering the endpoint.
