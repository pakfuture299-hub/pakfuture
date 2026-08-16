#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Self-healing tunnel URL updater.
#
# Runs every minute from the systemd timer deploy/update-tunnel-url.timer.
# Detects when the Cloudflare quick tunnel restarted (a NEW trycloudflare
# URL appears in /var/log/cloudflared.log), verifies the new URL serves
# /health, then pushes it to public/current-tunnel.txt (plus the hardcoded
# fallbacks in widget.js/widget.html). GitHub Pages redeploys automatically
# on push and the storefront widget picks the new URL up on its next load —
# no human step anywhere, for us or the client.
#
# Requires GITHUB_TOKEN (repo write access) in the chatbot .env.
# Idempotent and cheap: it exits immediately when nothing changed.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${CLOUDFLARED_LOG:-/var/log/cloudflared.log}"
POINTER="$REPO_DIR/public/current-tunnel.txt"
WIDGET_JS="$REPO_DIR/public/widget.js"
WIDGET_HTML="$REPO_DIR/public/widget.html"

# 1) Newest trycloudflare URL in the log (last restart wins).
#    Matches both the ready line ("Your quick Tunnel has been created!") and
#    the connection lines that follow; the tail takes the latest one.
NEW_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | tail -n 1 || true)"
[ -n "$NEW_URL" ] || exit 0

# 2) Only trust it once the backend actually answers /health through it.
if ! curl -sf -o /dev/null --max-time 10 "${NEW_URL}/health"; then
  exit 0
fi

# 3) No-op when the pointer already points at this URL.
CURRENT="$(tr -d '[:space:]' < "$POINTER" 2>/dev/null || true)"
[ "$CURRENT" = "$NEW_URL" ] && exit 0

# 4) Token for the push (kept root-only in .env, never committed).
GITHUB_TOKEN="$(grep -E '^GITHUB_TOKEN=' "$REPO_DIR/.env" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
[ -n "$GITHUB_TOKEN" ] || exit 0

# 5) Update pointer + hardcoded fallbacks so every discovery path is fresh.
printf '%s\n' "$NEW_URL" > "$POINTER"
sed -i "s|var API_BASE = 'https://[^']*'|var API_BASE = '$NEW_URL'|" "$WIDGET_JS" "$WIDGET_HTML"

# 6) Commit only the touched files and push.
cd "$REPO_DIR"
git add -- public/current-tunnel.txt public/widget.js public/widget.html
git -c user.name="tunnel-bot" -c user.email="tunnel-bot@users.noreply.github.com" \
  commit -m "Auto-update tunnel URL: ${NEW_URL}" --quiet
git pull --rebase --autostash origin main --quiet || true
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/pakfuture299-hub/pakfuture.git" main --quiet

printf '[%s] pushed %s\n' "$(date -u +%FT%TZ)" "$NEW_URL" >> /var/log/update-tunnel-url.log
