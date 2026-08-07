# Job Portal Chatbot — VPS deployment with systemd + Caddy
# Ubuntu 22.04/24.04 + Node 20+ (install via NodeSource or nvm)

# ---------------------------------------------------------------------------
# 0) Prepare the server
# ---------------------------------------------------------------------------
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl

# Node 22 LTS (adjust as needed)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# ---------------------------------------------------------------------------
# 1) Get the code
# ---------------------------------------------------------------------------
sudo mkdir -p /opt/job-portal-chatbot
sudo chown -R $USER:$USER /opt/job-portal-chatbot
git clone <your-repo-url> /opt/job-portal-chatbot
cd /opt/job-portal-chatbot
npm ci --omit=dev

# ---------------------------------------------------------------------------
# 2) Configure environment
# ---------------------------------------------------------------------------
cp .env.example .env
nano .env          # fill in OPENAI_API_KEY, N8N_WEBHOOK_URL, TELEGRAM_* ...
node scripts/check-env.js

# ---------------------------------------------------------------------------
# 3) systemd service
# ---------------------------------------------------------------------------
sudo tee /etc/systemd/system/job-portal-chatbot.service > /dev/null <<'EOF'
[Unit]
Description=Job Portal Chatbot API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/job-portal-chatbot
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
EnvironmentFile=/opt/job-portal-chatbot/.env
# Hardening
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now job-portal-chatbot
sudo systemctl status job-portal-chatbot

# ---------------------------------------------------------------------------
# 4) Caddy reverse proxy (auto HTTPS) — for the Telegram webhook endpoint
# ---------------------------------------------------------------------------
# Install Caddy, then edit /etc/caddy/Caddyfile:
#   chatbot.yourdomain.com {
#     reverse_proxy 127.0.0.1:3000
#   }
# Telegram requires a public HTTPS URL for webhooks. With polling mode you
# can skip this entirely (nothing else needs to be public).

# ---------------------------------------------------------------------------
# 5) Point Telegram at the public URL (webhook mode)
# ---------------------------------------------------------------------------
# In .env set:
#   TELEGRAM_WEBHOOK_URL=https://chatbot.yourdomain.com/webhook/telegram
# Then restart:
sudo systemctl restart job-portal-chatbot
# Or register manually:
# curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://chatbot.yourdomain.com/webhook/telegram&allowed_updates=[\"message\"]"

# ---------------------------------------------------------------------------
# 6) Monitoring
# ---------------------------------------------------------------------------
curl http://localhost:3000/health
# Optional: UptimeRobot / Cronitor hitting https://chatbot.yourdomain.com/health
