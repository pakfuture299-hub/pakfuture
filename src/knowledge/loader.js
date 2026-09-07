/**
 * Load the client's system-architecture knowledge source
 * (knowledge/architecture.md) at boot.
 *
 * This is the markdown rendering of the client's
 * Untitled.pdf — the single source of truth the
 * bot answers from. The same source is rendered into
 * knowledge/PDFs/job-portal-architecture.pdf by scripts/generate-pdf.js, so
 * the bot answers from exactly what the PDF documents. If the file is
 * missing, the loader returns an empty string and the bot falls back to the
 * curated rules in knowledge/base.js (which also come from the PDF).
 */

const fs = require('fs');
const path = require('path');

const ARCH_FILE = path.join(__dirname, '..', '..', 'knowledge', 'architecture.md');

function loadStoreContent() {
  try {
    if (fs.existsSync(ARCH_FILE)) {
      return fs.readFileSync(ARCH_FILE, 'utf8');
    }
  } catch (err) {
    // Never fail boot because a knowledge artifact is missing.
  }
  return '';
}

module.exports = { loadStoreContent, ARCH_FILE };
