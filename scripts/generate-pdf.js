/**
 * Render knowledge/store-scrape.md into knowledge/PDFs/store-content.pdf.
 *
 * Uses pdfkit (devDependency only) — pure JS, no browser required.
 * The markdown here is the generator's own output (scripts/scrape-store.js),
 * so parsing is intentionally simple: headings (#/##/###), blockquotes (>),
 * fenced blocks (```), and paragraphs. List markers (-, *, numbered) are
 * rendered as plain paragraphs with a leading bullet.
 *
 * Usage: node scripts/generate-pdf.js
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const SRC = path.join(__dirname, '..', 'knowledge', 'store-scrape.md');
const OUT_DIR = path.join(__dirname, '..', 'knowledge', 'PDFs');
const OUT_FILE = path.join(OUT_DIR, 'store-content.pdf');

const ACCENT = '#25d366';
const DARK = '#222222';
const MUTED = '#666666';

function renderMarkdown(doc, md) {
  const lines = md.split(/\r?\n/);

  // Strip the auto-generated timestamp so the PDF doesn't churn on regen.
  const body = lines.filter((l) => !/^> Generated:/.test(l));

  for (const line of body) {
    const text = line.replace(/&nbsp;/g, ' ');

    if (/^```/.test(text)) {
      continue; // skip fenced-code markers (none expected from the scraper)
    }
    if (/^#{1,3}\s/.test(text)) {
      const level = /^(#{1,3})\s/.exec(text)[1].length;
      const content = text.replace(/^#{1,3}\s/, '').trim();
      if (!content) continue;

      if (level === 1) {
        doc.moveDown(0.5);
        doc.fontSize(20).fillColor(DARK).text(content.toUpperCase(), { characterSpacing: 0.5 });
        doc.moveDown(0.4);
        doc.moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor(ACCENT)
          .lineWidth(2)
          .stroke();
        doc.moveDown(0.8);
      } else if (level === 2) {
        doc.moveDown(0.6);
        doc.fontSize(15).fillColor(ACCENT).text(content, { characterSpacing: 0.2 });
        doc.moveDown(0.3);
      } else {
        doc.moveDown(0.4);
        doc.fontSize(12).fillColor(DARK).text(content);
        doc.moveDown(0.2);
      }
      continue;
    }
    if (/^>\s/.test(text)) {
      doc.fontSize(9.5).fillColor(MUTED).text(text.replace(/^>\s?/, ''), { italics: true });
      doc.moveDown(0.3);
      continue;
    }
    if (/^---\s*$/.test(text)) {
      doc.moveDown(0.5);
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#dddddd')
        .lineWidth(0.75)
        .stroke();
      doc.moveDown(0.5);
      continue;
    }
    if (/^[-*]\s/.test(text)) {
      doc.fontSize(10.5).fillColor(DARK).text('•  ' + text.replace(/^[-*]\s/, ''));
      doc.moveDown(0.15);
      continue;
    }
    if (/^\d+[.)]\s/.test(text)) {
      doc.fontSize(10.5).fillColor(DARK).text(text);
      doc.moveDown(0.15);
      continue;
    }
    if (!text.trim()) {
      doc.moveDown(0.3);
      continue;
    }
    // Plain paragraph.
    doc.fontSize(10.5).fillColor(DARK).text(text, { lineGap: 2 });
    doc.moveDown(0.2);
  }
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing ${SRC} — run "npm run scrape" first.`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = fs.readFileSync(SRC, 'utf8');

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: 'Job Portal Global 2 — Store Content',
      Author: 'Job Portal Chatbot',
    },
  });

  const stream = fs.createWriteStream(OUT_FILE);
  doc.pipe(stream);
  renderMarkdown(doc, md);
  doc.end();

  // Wait for the write stream to flush before exiting.
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`Wrote ${OUT_FILE} (${kb} KB)`);
}

main().catch((err) => {
  console.error('PDF generation failed:', err);
  process.exit(1);
});
