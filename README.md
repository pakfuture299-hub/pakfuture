# 🤖 Job Portal Global — Recruitment Chat Widget

Interactive AI chat widget for **JOB PORTAL GLOBAL 2** (`https://job-portal-global.myshopify.com/`), running on a VPS.

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
├── src/
│   ├── server.js             # boot: config → HTTP → shutdown
│   ├── app.js                # Express app (health, /api/chat, /widget)
│   ├── config/index.js       # env config with fail-fast required vars
│   ├── knowledge/base.js     # ⭐ THE "PDF" — store facts, jobs, FAQ, guardrails
│   ├── services/
│   │   ├── chat.js           # storefront chat engine → maps intents to Telegram link
│   │   ├── openai.js         # OpenAI intent classification + grounded answers
│   │   └── telegram.js       # legacy Telegram bot client (optional)
│   ├── store/index.js        # in-memory rate limiting
│   └── utils/                # validation, http retry, logger
├── public/widget.html        # the embeddable chat widget (floating bubble)
├── deploy/vps-deploy.sh      # Ubuntu VPS: systemd + Caddy + Node
├── scripts/check-env.js      # boot-time env validation
└── tests/                    # node:test unit + smoke tests
```

---

## Conversation flow

1. **Open** — visitor clicks the floating bubble on the Shopify site; a friendly welcome appears with the Telegram invite link.
2. **Ask anything** — the visitor types a question. OpenAI classifies the intent (`greeting`, `apply`, `provide_info`, `telegram_help`, `out_of_scope`).
3. **Reply + link** — the bot answers knowledge-based questions (jobs, how to apply, earnings) and then hands out the invite link:
   - **Greeting** → welcome + link
   - **Wants to apply** → link (that's the whole hand-off)
   - **Info question** → grounded answer + link
   - **Telegram help** → link
   - **Out of scope** → friendly redirect to the website + link

The only thing the bot ever directs the visitor toward is the Telegram invite link configured in `INVITE_LINK` (default `https://t.me/+923244362726`). Nothing is collected on the site — the hiring team takes over inside Telegram.

### Out-of-scope guardrail

Everything **not** in the knowledge base — refunds, shipping, orders, discounts, unrelated topics — gets a friendly redirect to the website plus the Telegram link, never an improvised answer.

---

## Legacy: n8n / Telegram-bot intake (no longer required)

The original design collected candidate details (name → phone → Telegram) inside a Telegram bot and POSTed them to n8n → Google Sheets. That whole path is now **optional** — the widget only hands out the invite link. The old files remain in the repo (`n8n/`, `google/`, `src/services/conversation.js`, `src/services/submission.js`) for reference, but nothing in the widget flow uses them.

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

The widget lives on the Shopify storefront, which is served over **HTTPS**. Browsers block "mixed content" — an HTTPS page cannot call a plain-`http://` API. So the bot's public URL must be HTTPS too. Two ways:

- **Domain + Caddy** (recommended): point `chatbot.yourdomain.com` at the VPS, then in the Caddyfile:
  ```
  chatbot.yourdomain.com {
      reverse_proxy 127.0.0.1:3000
  }
  ```
  and set `ALLOWED_ORIGINS=https://job-portal-global.myshopify.com` so the storefront is allowed to call it.

- **Cloudflare Tunnel** (free, no domain): `cloudflared tunnel --url http://localhost:3000` gives you a public `https://...trycloudflare.com` URL. Use that as the widget's API base.

Then embed the widget on Shopify:

1. Shopify admin → **Online Store → Themes → ⋯ → Edit code**.
2. In `layout/theme.liquid`, right before `</body>`, add an iframe pointing at the widget:
   ```html
   <iframe
     src="https://chatbot.yourdomain.com/widget"
     style="position:fixed;bottom:0;right:0;width:0;height:0;border:0;z-index:99999"
     title="Chat widget"
   ></iframe>
   ```
   (The widget renders its own floating bubble and window, so the iframe itself stays invisible.)

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
