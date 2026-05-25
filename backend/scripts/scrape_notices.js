// scripts/scrape_notices.js
// ─────────────────────────────────────────────────────────────────────────────
// RGPVMate — RGPV Notice Scraper + Ingestion Pipeline  (Phase 4.5)
//
// Source:  https://www.rgpv.ac.in/Uni/ImpNoticeArchive.aspx
//
// What it does:
//   1. Opens the RGPV archive page (loads ALL notices in one ASP.NET ViewState)
//   2. Extracts title, date, and the postback control-ID from every 3-cell row
//   3. For each NEW notice, clicks the row link → captures the navigated PDF/page URL
//   4. Deduplicates via SHA1(title|date) stored in MongoDB
//   5. Auto-classifies notices (exam / result / admission / scholarship / …)
//   6. Generates embeddings via the Python embedder → stores chunks in Qdrant
//   7. Saves structured metadata to MongoDB (Notice collection)
//
// Usage:
//   node scripts/scrape_notices.js              ← full run (new notices only)
//   node scripts/scrape_notices.js --dry-run    ← print what would be saved, no DB
//   node scripts/scrape_notices.js --force      ← re-process even seen notices
//   node scripts/scrape_notices.js --limit 50   ← only first N notices
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config();

const { chromium }    = require('playwright');
const mongoose        = require('mongoose');
const crypto          = require('crypto');
const axios           = require('axios');
const { QdrantClient } = require('@qdrant/js-client-rest');

const Notice = require('../models/Notice');

// ── CLI Flags ──────────────────────────────────────────────────────────────────
const argv    = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const FORCE   = argv.includes('--force');
const limIdx  = argv.indexOf('--limit');
const LIMIT   = limIdx !== -1 ? parseInt(argv[limIdx + 1], 10) : Infinity;

// ── Config ─────────────────────────────────────────────────────────────────────
const ARCHIVE_URL     = 'https://www.rgpv.ac.in/Uni/ImpNoticeArchive.aspx';
const COLLECTION_NAME = 'rgpvmate_docs';

// ── Qdrant Client ───────────────────────────────────────────────────────────────
const qdrant = new QdrantClient({
  url:    process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  port:   process.env.QDRANT_URL.startsWith('https') ? 443 : undefined,
});

// ── Helpers ─────────────────────────────────────────────────────────────────────


/** SHA1 of a string — dedup key */
function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

/** Convert a 40-char hex SHA1 → UUID (pad/trim to 32 hex chars first) */
function sha1ToUuid(hex) {
  const h = hex.slice(0, 32).padEnd(32, '0');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

/**
 * Auto-classify a notice title → { category, alertLevel }
 */
function classifyNotice(title) {
  const t = title.toLowerCase();
  if (/time\s*table|date\s*sheet|exam.*schedule|examination.*date|exam.*time/.test(t)) {
    return { category: 'date_sheet', alertLevel: 'high' };
  }
  if (/admit\s*card|hall\s*ticket/.test(t)) {
    return { category: 'exam', alertLevel: 'high' };
  }
  if (/result|mark\s*sheet|marksheet|grade\s*card|revaluation/.test(t)) {
    return { category: 'result', alertLevel: 'high' };
  }
  if (/admission|enrollment|registration|enroll/.test(t)) {
    return { category: 'admission', alertLevel: 'medium' };
  }
  if (/scholarship|stipend|fellowship/.test(t)) {
    return { category: 'scholarship', alertLevel: 'medium' };
  }
  if (/fee|tuition|payment|dues/.test(t)) {
    return { category: 'fee', alertLevel: 'medium' };
  }
  return { category: 'general', alertLevel: 'low' };
}

/**
 * Parse Indian date string dd/mm/yyyy or dd-mm-yyyy → JS Date (or null)
 */
function parseIndianDate(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const dt = new Date(`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(str.trim());
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Embed text via the Python embedder service.
 */
async function getEmbedding(text) {
  const res = await axios.post(
    `${process.env.EMBEDDER_URL}/embed`,
    { text },
    { timeout: 20000 }
  );
  return res.data.vector;
}

/**
 * Upsert a notice text chunk into Qdrant.
 * Returns true on success, false if embedding fails.
 */
async function ingestToQdrant(notice) {
  const text = [
    `[RGPV Notice] ${notice.title}`,
    `Date: ${notice.publishedAt ? notice.publishedAt.toDateString() : 'N/A'}`,
    `Category: ${notice.category}`,
    notice.attachmentUrl ? `Link: ${notice.attachmentUrl}` : '',
  ].filter(Boolean).join('\n');

  let vector;
  try {
    vector = await getEmbedding(text);
  } catch (err) {
    console.warn(`  ⚠️  Embedding failed: ${err.message}`);
    return false;
  }

  await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points: [{
      id:     sha1ToUuid(notice.hash),
      vector,
      payload: {
        text,
        source:      'RGPV_Notice',
        type:        'notice',
        category:    notice.category,
        alertLevel:  notice.alertLevel,
        title:       notice.title,
        publishedAt: notice.publishedAt ? notice.publishedAt.toISOString() : null,
        link:        notice.attachmentUrl || ARCHIVE_URL,
        hash:        notice.hash,
      },
    }],
  });
  return true;
}

// ── Main Scraper ──────────────────────────────────────────────────────────────
async function scrapeNotices() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' RGPVMate — Notice Scraper + Ingestion Pipeline (Phase 4.5)');
  if (DRY_RUN)          console.log(' Mode: DRY RUN — no DB / Qdrant writes');
  if (FORCE)            console.log(' Mode: FORCE   — re-processing all notices');
  if (LIMIT !== Infinity) console.log(` Limit: first ${LIMIT} notices`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Connect MongoDB ──────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');
  }

  const stats = { found: 0, new: 0, skipped: 0, ingested: 0, errors: 0 };

  // ── Launch Playwright ────────────────────────────────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
  });
  const page = await context.newPage();
  page.on('console', () => {});
  page.on('pageerror', () => {});

  try {
    console.log(`📡 Loading RGPV notices archive...`);
    await page.goto(ARCHIVE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('✅ Archive loaded\n');

    // ── Extract all notice rows ──────────────────────────────────────────────
    // The archive page loads everything in a single ASP.NET GridView (GVView).
    // Row structure: <td>(empty)</td> <td>dd/mm/yyyy</td> <td><a>Title</a></td>
    // Rows i=0,1 are mega-rows (pagination & CSS), i=2 is the header, i>=3 are data.
    const rawNotices = await page.evaluate(() => {
      // The GridView renders as a Bootstrap .table-striped with no element ID
      const rows = Array.from(document.querySelectorAll('.table-striped tr'));

      return rows.map(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 3) return null;

        const dateText = tds[1]?.innerText?.trim();
        if (!dateText || !/\d{2}\/\d{2}\/\d{4}/.test(dateText)) return null; // skip header

        const anchor   = tds[2]?.querySelector('a[href]');
        const title    = anchor?.innerText?.trim() || tds[2]?.innerText?.trim() || '';
        const postback = anchor?.getAttribute('href') || '';

        // Extract the ctl ID from __doPostBack('...GVView$ctlXX$LbnTitle','')
        const ctlMatch = postback.match(/GVView\$(ctl\d+)\$LbnTitle/);
        const ctlId    = ctlMatch ? ctlMatch[1] : null;

        if (!title || title.length < 4) return null;

        return { dateText, title, ctlId, postback };
      }).filter(Boolean);
    });

    console.log(`📊 Found ${rawNotices.length} notices in archive\n`);
    stats.found = rawNotices.length;

    const toProcess = rawNotices.slice(0, LIMIT === Infinity ? rawNotices.length : LIMIT);

    for (let i = 0; i < toProcess.length; i++) {
      const raw         = toProcess[i];
      const title       = raw.title.replace(/\s+/g, ' ').trim();
      const publishedAt = parseIndianDate(raw.dateText);
      const hash        = sha1(`${title}|${raw.dateText}`);
      const { category, alertLevel } = classifyNotice(title);

      const prefix = `[${i + 1}/${toProcess.length}]`;
      console.log(`${prefix} [${alertLevel.toUpperCase()}/${category}] ${title.slice(0, 65)}${title.length > 65 ? '…' : ''}`);

      if (DRY_RUN) {
        console.log(`         date: ${raw.dateText}  hash: ${hash.slice(0,8)}…`);
        stats.new++;
        continue;
      }

      // ── Dedup check ──────────────────────────────────────────────────────────
      const existing = await Notice.findOne({ hash });
      if (existing && !FORCE) {
        console.log(`         ⏭️  Already in DB — skipping`);
        stats.skipped++;
        continue;
      }

      // Note: RGPV uses ASP.NET strict-mode PostBack to open PDFs.
      // Triggering __doPostBack via page.evaluate is blocked by 'arguments' access restriction.
      // We store the notice title + date for RAG retrieval; PDF URL is left null.
      // A future enhancement can use a separate Playwright page to click links properly.
      const attachmentUrl = null;


      // ── Upsert MongoDB ───────────────────────────────────────────────────────
      const noticeData = {
        title,
        hash,
        sourceUrl:     ARCHIVE_URL,
        attachmentUrl: attachmentUrl || null,
        publishedAt,
        category,
        alertLevel,
        scrapedAt:     new Date(),
        snippet:       title,
        ingested:      false,
      };

      let noticeDoc;
      try {
        noticeDoc = await Notice.findOneAndUpdate(
          { hash },
          { $set: noticeData },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        stats.new++;
        console.log(`         💾 Saved to MongoDB${attachmentUrl ? ' (with PDF link)' : ''}`);
      } catch (dbErr) {
        console.error(`         ❌ MongoDB: ${dbErr.message}`);
        stats.errors++;
        continue;
      }

      // ── Embed + Ingest to Qdrant ─────────────────────────────────────────────
      try {
        const ok = await ingestToQdrant(noticeDoc);
        if (ok) {
          await Notice.updateOne({ hash }, { $set: { ingested: true } });
          stats.ingested++;
          console.log(`         ✅ Embedded → Qdrant`);
        } else {
          console.log(`         ⚠️  MongoDB only (embed failed)`);
        }
      } catch (qErr) {
        console.warn(`         ⚠️  Qdrant: ${qErr.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

  } finally {
    await browser.close();
    if (!DRY_RUN) await mongoose.disconnect();
  }

  // ── Final Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` Notice Scrape ${DRY_RUN ? 'Dry Run ' : ''}Complete`);
  console.log(`   Found     : ${stats.found}`);
  console.log(`   New       : ${stats.new}`);
  console.log(`   Skipped   : ${stats.skipped}  (already ingested)`);
  console.log(`   Qdrant    : ${stats.ingested}  (embedded)`);
  console.log(`   Errors    : ${stats.errors}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!DRY_RUN && stats.new > 0) {
    console.log('💡 Test: Ask the chatbot "any new RGPV exam notices?" to verify retrieval.\n');
  }

  return stats;
}

// ── Entry Point ───────────────────────────────────────────────────────────────
scrapeNotices().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
