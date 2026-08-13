/**
 * Extract the client's Job_Portal_Bot_System_Architecture.pdf into
 * knowledge/architecture.md — the single source of truth the bot answers
 * from.
 *
 * The PDF is supplied by the client; knowledge/architecture.md is its
 * markdown rendering. The same source is rendered back into
 * knowledge/PDFs/job-portal-architecture.pdf by scripts/generate-pdf.js.
 *
 * Usage: node scripts/extract-pdf.js [path-to-pdf]
 * Default source: Job_Portal_Bot_System_Architecture.pdf (repo root).
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const SRC = path.join(__dirname, '..', process.argv[2] || 'Job_Portal_Bot_System_Architecture.pdf');
const OUT = path.join(__dirname, '..', 'knowledge', 'architecture.md');

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing ${SRC} — place the client's PDF at the repo root (or pass a path).`);
    process.exit(1);
  }

  const buf = fs.readFileSync(SRC);
  const result = await pdfParse(buf);

  fs.writeFileSync(OUT, result.text, 'utf8');
  console.log(`Wrote ${OUT} (${result.numpages} pages, ${result.text.length} chars)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
