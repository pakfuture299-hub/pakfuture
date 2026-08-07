#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# n8n on a fresh Contabo Ubuntu VPS — no-domain setup (Docker + PostgreSQL).
#
# Run as root (or with sudo):
#   sudo bash /opt/n8n-vps-setup.sh
#
# Secrets are read from /opt/n8n-secrets.env — put that file on the VPS first:
#   scp deploy/vps-secrets.env root@169.58.108.226:/opt/n8n-secrets.env
#
# What this does:
#   1. Installs Docker + compose plugin.
#   2. Writes /opt/n8n/docker-compose.yml with your secrets.
#   3. Starts n8n + PostgreSQL with restart: unless-stopped (24/7).
#
# n8n is bound to 127.0.0.1:5678 — NOT exposed to the internet. That is fine:
# the chatbot backend runs on this same VPS and calls the webhook over
# localhost. You reach the n8n editor with an SSH tunnel:
#
#   ssh -L 5678:127.0.0.1:5678 root@169.58.108.226
#   # then open http://localhost:5678 in your browser
#
# After it starts:
#   1. Open the editor via the SSH tunnel, log in with the ADMIN_USER/ADMIN_PASSWORD
#      you set in vps-secrets.env.
#   2. Add a Google credential (Settings → Credentials → Google)
#      and a Telegram credential (bot token from @BotFather).
#   3. Import recruitment-workflow.json, attach the credentials, and Activate it.
#   4. Run deploy/n8n-test-webhook.sh to verify the pipeline.
# ---------------------------------------------------------------------------
set -euo pipefail

SECRETS_FILE="${1:-/opt/n8n-secrets.env}"
if [ ! -f "$SECRETS_FILE" ]; then
  echo "ERROR: secrets file not found at $SECRETS_FILE"
  echo "Copy deploy/vps-secrets.env to the VPS and fill in the TELEGRAM values first."
  exit 1
fi
set -a; source "$SECRETS_FILE"; set +a

# Sanity checks
: "${ADMIN_USER:?ADMIN_USER not set in $SECRETS_FILE}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD not set in $SECRETS_FILE}"
: "${ENCRYPTION_KEY:?ENCRYPTION_KEY not set in $SECRETS_FILE}"
: "${DB_PASSWORD:?DB_PASSWORD not set in $SECRETS_FILE}"
# Telegram values are optional at first boot — n8n runs fine without them.
# The "Notify Admin Group" workflow step only works once they are set. Add
# them to the secrets file and re-run this script later (safe: it just
# rewrites the compose file and restarts the container).
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ADMIN_CHAT_ID:-}" ]; then
  echo "WARNING: TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID are not set."
  echo "         n8n will start, but the admin Telegram notification will fail"
  echo "         until you add them to $SECRETS_FILE and re-run this script."
fi

# 1) Base packages + Docker
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 2) Compose file with secrets filled in
mkdir -p /opt/n8n
cat > /opt/n8n/docker-compose.yml <<EOF
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    restart: unless-stopped
    ports:
      - "127.0.0.1:5678:5678"
    environment:
      - N8N_HOST=localhost
      - N8N_PROTOCOL=http
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${ADMIN_USER}
      - N8N_BASIC_AUTH_PASSWORD=${ADMIN_PASSWORD}
      - N8N_ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_ADMIN_CHAT_ID=${TELEGRAM_ADMIN_CHAT_ID}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${DB_PASSWORD}
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=72
      - EXECUTIONS_DATA_PRUNE_MAX_COUNT=10000
      - EXECUTIONS_DATA_SAVE_ON_ERROR=all
      - EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
      - EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
      - EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
      - EXECUTIONS_MODE=regular
      - GENERIC_TIMEZONE=Asia/Karachi
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  n8n_data:
  postgres_data:
EOF

# 3) Start n8n
cd /opt/n8n
docker compose up -d

echo
echo "=== Done ==="
echo "n8n is running on the VPS (127.0.0.1:5678)."
echo
echo "To open the editor from your laptop, run:"
echo "  ssh -L 5678:127.0.0.1:5678 root@169.58.108.226"
echo "  then browse to http://localhost:5678"
echo
echo "Next steps:"
echo "  1. Log in with user '${ADMIN_USER}' and the admin password you set."
echo "  2. Add Google + Telegram credentials (Settings -> Credentials)."
echo "  3. Import recruitment-workflow.json, attach the credentials, and Activate it."
echo "  4. Run deploy/n8n-test-webhook.sh to verify the pipeline."
