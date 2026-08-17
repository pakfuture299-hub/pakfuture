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

# 3) (No early exit here — even if the pointer already matches, there may
#    be an unpushed commit from a previous failed push that still needs
#    sending. The push step below only acts when commits are pending.)

# 4) Token for the push. Preferred: .env, parsed strictly so a stray
#    <placeholder> or quoted line can never break the push. Fallback:
#    the boot-script token already stored on the VPS (/root/.git-token).
GITHUB_TOKEN="$(grep -E '^GITHUB_TOKEN=ghp_[A-Za-z0-9]{20,}' "$REPO_DIR/.env" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
if [ -z "$GITHUB_TOKEN" ] && [ -f /root/.git-token ]; then
  GITHUB_TOKEN="$(head -n 1 /root/.git-token)"
fi
[ -n "$GITHUB_TOKEN" ] || { echo "[$(date -u +%FT%TZ)] no token found, skipping push for ${NEW_URL}" >> /var/log/update-tunnel-url.log; exit 0; }

# 5) Update pointer + hardcoded fallbacks so every discovery path is fresh.
printf '%s\n' "$NEW_URL" > "$POINTER"
sed -i "s|var API_BASE = 'https://[^']*'|var API_BASE = '$NEW_URL'|" "$WIDGET_JS" "$WIDGET_HTML"

# 6) Commit the touched files (no-op if unchanged) and push ANY pending
#    commits. The push is attempted even when the pointer already matches,
#    so a commit that failed to push earlier is never stranded forever.
cd "$REPO_DIR"
git add -- public/current-tunnel.txt public/widget.js public/widget.html
git -c user.name="tunnel-bot" -c user.email="tunnel-bot@users.noreply.github.com" \
  commit -m "Auto-update tunnel URL: ${NEW_URL}" --quiet || true
git pull --rebase --autostash origin main --quiet || true

if [ "$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)" -gt 0 ]; then
  if git push "https://x-access-token:${GITHUB_TOKEN}@github.com/pakfuture299-hub/pakfuture.git" main --quiet; then
    echo "[$(date -u +%FT%TZ)] pushed ${NEW_URL}" >> /var/log/update-tunnel-url.log
  else
    # Fallback: reuse credentials already stored on the VPS.
    echo "[$(date -u +%FT%TZ)] token push failed, trying stored creds for ${NEW_URL}" >> /var/log/update-tunnel-url.log
    git push origin main --quiet && echo "[$(date -u +%FT%TZ)] pushed ${NEW_URL} via stored creds" >> /var/log/update-tunnel-url.log || echo "[$(date -u +%FT%TZ)] push failed for ${NEW_URL}" >> /var/log/update-tunnel-url.log
  fi
fi
