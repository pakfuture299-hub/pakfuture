#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Smoke-test the recruitment pipeline on the VPS: POST a fake candidate to the
# n8n webhook over localhost. If the workflow is set up correctly you should
# see:
#   - a new row in Google Sheets, and
#   - a "New Candidate" message in the Telegram admin group.
#
# Run on the VPS (or over SSH):
#   sudo bash deploy/n8n-test-webhook.sh
# ---------------------------------------------------------------------------
set -euo pipefail

WEBHOOK="http://127.0.0.1:5678/webhook/recruitment"
NAME="Test Candidate $(date +%s)"
PHONE="+92300$(date +%H%M%S)"
TG="@test_user_$(date +%s)"

echo "POSTing to ${WEBHOOK}"
curl -sS -X POST "${WEBHOOK}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${NAME}\",\"phone\":\"${PHONE}\",\"telegram\":\"${TG}\",\"source\":\"deploy-test\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}"

echo
echo "Sent. Check Google Sheets and the admin Telegram group for:"
echo "  Name: ${NAME}"
echo "  Phone: ${PHONE}"
echo "  Telegram: ${TG}"
