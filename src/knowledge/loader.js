/**
 * Load the scraped store content (knowledge/store-scrape.md) at boot.
 *
 * This is the same source that scripts/generate-pdf.js renders into
 * knowledge/PDFs/store-content.pdf, so the bot answers from exactly what the
 * PDF documents. If the file is missing (fresh clone before running
 * `npm run scrape`), the loader returns an empty string and the bot simply
 * falls back to the curated rules in knowledge/base.js.
 */

const fs = require('fs');
const path = require('path');

const SCRAPE_FILE = path.join(__dirname, '..', '..', 'knowledge', 'store-scrape.md');

function loadStoreContent() {
  try {
    if (fs.existsSync(SCRAPE_FILE)) {
      return fs.readFileSync(SCRAPE_FILE, 'utf8');
    }
  } catch (err) {
    // Never fail boot because a knowledge artifact is missing.
  }
  return '';
}

module.exports = { loadStoreContent, SCRAPE_FILE };
