/**
 * Google Apps Script — standalone integration.
 *
 * If you prefer NOT to run the n8n workflow, deploy this as a Google Apps
 * Script web app (https://script.google.com) and point N8N_WEBHOOK_URL at its
 * URL. It:
 *   1. receives the candidate JSON,
 *   2. appends a row to your Google Sheet (Timestamp, Name, Phone, Telegram,
 *      Source, Status),
 *   3. sends the instant notification to your private Telegram admin group.
 *
 * Deployment:
 *   1. Create a new spreadsheet, note its ID (the long id in the URL).
 *   2. Create a new Apps Script project (Extensions → Apps Script).
 *   3. Paste this file, set SPREADSHEET_ID / TELEGRAM_BOT_TOKEN /
 *      TELEGRAM_ADMIN_CHAT_ID below.
 *   4. Deploy → New deployment → Web app → "Anyone" → Execute as "Me".
 *   5. Copy the /exec URL into .env as N8N_WEBHOOK_URL.
 *
 * Google Sheets columns expected (row 1 = headers):
 *   Timestamp | Name | Phone | Telegram | Source | Status
 */

const SPREADSHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const SHEET_NAME = 'Sheet1';
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_ADMIN_CHAT_ID = 'YOUR_ADMIN_CHAT_ID';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    const timestamp = body.timestamp || new Date().toISOString();
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const telegram = String(body.telegram || '').trim();
    const source = body.source || 'Shopify Chatbot';
    const status = body.status || 'New';

    // Required-field validation (mirrors the n8n workflow).
    if (!name || !phone || !telegram) {
      return jsonResponse({ ok: false, error: 'Missing required fields' }, 400);
    }

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    sheet.appendRow([timestamp, name, phone, telegram, source, status]);

    // Instant notification to the private admin group.
    const message =
      `🆕 New Candidate\n\n` +
      `Name: ${name}\n` +
      `Phone: ${phone}\n` +
      `Telegram: ${telegram}\n\n` +
      `Submitted: ${timestamp}`;

    const url =
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: message,
      }),
      muteHttpExceptions: true,
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

function jsonResponse(obj, code) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setStatusCode(code || 200);
}
