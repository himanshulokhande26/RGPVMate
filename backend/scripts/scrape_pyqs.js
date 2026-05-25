// scripts/scrape_pyqs.js
// ─────────────────────────────────────────────────────────────────────────────
// RGPVMate — RGPV PYQ Scraper  (source: rgpvonline.com)
// Crawls ALL course/branch listing pages and downloads every PYQ PDF from the
// last 10 years into documents/pyq/.
//
// Usage:
//   node scripts/scrape_pyqs.js                          ← scrape all branches, last 10 years
//   node scripts/scrape_pyqs.js --branch CSE             ← one branch only
//   node scripts/scrape_pyqs.js --dry-run                ← list what would download (no files)
//   node scripts/scrape_pyqs.js --all-years              ← skip the 10-year filter
//   node scripts/scrape_pyqs.js --branch ME --dry-run
//
// Output filename convention:
//   RGPV_PYQ_<BRANCH>_<slug>.pdf
//   e.g.  RGPV_PYQ_CSE_cs-501-data-structures-dec-2023.pdf
//
// No external npm packages needed — uses only Node.js built-in https/http.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const ALL_YEARS   = args.includes('--all-years');
const DEBUG       = args.includes('--debug');
const branchIdx   = args.indexOf('--branch');
const ONLY_BRANCH = branchIdx !== -1 ? args[branchIdx + 1].toUpperCase() : null;

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL    = 'https://www.rgpvonline.com';
const DOCS_DIR    = path.resolve(__dirname, '../../documents/pyqs');
const DELAY_MS    = 600;   // polite delay between requests (ms)
const MAX_RETRIES = 3;     // per-file retry attempts

// Year filter: last 10 years (e.g. 2015–2025)
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR     = ALL_YEARS ? 0 : CURRENT_YEAR - 10;

// ── Branch / Course listing pages ─────────────────────────────────────────────
// Every entry maps a branch token → the rgpvonline.com listing page that
// enumerates all individual PYQ HTML pages for that branch.
const BRANCH_SOURCES = [

  // ── B.Tech / B.E. — core branches ──────────────────────────────────────────
  { branch: 'CSE',    label: 'B.Tech Computer Science',          listUrl: '/btech-cse-question-papers.html'       },
  { branch: 'IT',     label: 'B.Tech Information Technology',    listUrl: '/btech-it-question-papers.html'        },
  { branch: 'ME',     label: 'B.Tech Mechanical',                listUrl: '/btech-me-question-papers.html'        },
  { branch: 'CE',     label: 'B.Tech Civil',                     listUrl: '/btech-civil-question-papers.html'     },
  { branch: 'EC',     label: 'B.Tech Electronics (All)',         listUrl: '/btech-e-all-question-papers.html'     },
  { branch: 'CH',     label: 'B.Tech Chemical',                  listUrl: '/btech-chemical-question-papers.html'  },
  { branch: 'FT',     label: 'B.Tech Fire Technology',           listUrl: '/btech-ft-question-papers.html'        },
  { branch: 'MI',     label: 'B.Tech Mining',                    listUrl: '/btech-mi-question-papers.html'        },
  { branch: 'MM',     label: 'B.Tech Multimedia / Mechatronics', listUrl: '/btech-mm-question-papers.html'        },
  { branch: 'TX',     label: 'B.Tech Textile',                   listUrl: '/btech-tx-question-papers.html'        },
  { branch: 'AB',     label: 'B.Tech Agriculture Bio',           listUrl: '/btech-ab-question-papers.html'        },
  { branch: 'IO',     label: 'B.Tech Industrial / Production',   listUrl: '/btech-io-question-papers.html'        },

  // ── B.Tech — new / emerging specialisations ─────────────────────────────────
  { branch: 'AIML',   label: 'B.Tech AI & Machine Learning',     listUrl: '/btech-aiml-question-papers.html'      },
  { branch: 'AI',     label: 'B.Tech Artificial Intelligence',   listUrl: '/btech-ai-question-papers.html'        },
  { branch: 'AD',     label: 'B.Tech AI & Data Science',         listUrl: '/btech-ad-question-papers.html'        },
  { branch: 'CSBS',   label: 'B.Tech CS & Business Systems',     listUrl: '/btech-csbs-question-papers.html'      },
  { branch: 'CD',     label: 'B.Tech CS & Design',               listUrl: '/btech-cd-question-papers.html'        },
  { branch: 'IOT',    label: 'B.Tech CSE IoT',                   listUrl: '/btech-cse-iot-question-papers.html'   },
  { branch: 'CSIT',   label: 'B.Tech CS & IT',                   listUrl: '/btech-csit-question-papers.html'      },
  { branch: 'CY',     label: 'B.Tech Cyber Security',            listUrl: '/btech-cy-question-papers.html'        },
  { branch: 'IS',     label: 'B.Tech Information Security',      listUrl: '/btech-is-question-papers.html'        },
  { branch: 'SD',     label: 'B.Tech Software Development',      listUrl: '/btech-sd-question-papers.html'        },
  { branch: 'RM',     label: 'B.Tech Robotics & Mechatronics',   listUrl: '/btech-rm-question-papers.html'        },
  { branch: 'AUTO',   label: 'B.Tech Automobile',                listUrl: '/btech-auto-question-papers.html'      },
  { branch: 'ANIM',   label: 'B.Tech 3D Animation & Graphics',   listUrl: '/btech-3dag-question-papers.html'      },
  { branch: 'OTHERS', label: 'B.Tech Others',                    listUrl: '/btech-others-question-papers.html'    },

  // ── First year (common to all branches) ─────────────────────────────────────
  { branch: 'FY',     label: 'First Year (Common)',              listUrl: '/rgpv-first-year.html'                 },

  // ── Pharmacy ────────────────────────────────────────────────────────────────
  { branch: 'BPHARM', label: 'B.Pharmacy',                       listUrl: '/bpharmacy.html'                       },
  { branch: 'DPHARM', label: 'D.Pharmacy',                       listUrl: '/dpharmacy.html'                       },
  { branch: 'MPHARM', label: 'M.Pharmacy',                       listUrl: '/mpharmacy.html'                       },

  // ── Diploma ─────────────────────────────────────────────────────────────────
  { branch: 'DIPLOMA',label: 'Diploma',                          listUrl: '/rgpv-diploma.html'                    },

  // ── Post-graduate programs ───────────────────────────────────────────────────
  { branch: 'MCA',    label: 'MCA',                              listUrl: '/mca.html'                             },
  { branch: 'MTECH',  label: 'M.Tech',                           listUrl: '/mtech.html'                           },
  { branch: 'MBA',    label: 'MBA',                              listUrl: '/mba.html'                             },
  { branch: 'MAM',    label: 'MAM',                              listUrl: '/mam.html'                             },

  // ── Architecture ────────────────────────────────────────────────────────────
  { branch: 'BARCH',  label: 'B.Arch',                           listUrl: '/barch.html'                           },
  { branch: 'MARCH',  label: 'M.Arch',                           listUrl: '/march.html'                           },

  // ── Research ────────────────────────────────────────────────────────────────
  { branch: 'PHD',    label: 'Ph.D.',                            listUrl: '/phd.html'                             },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Minimal HTTP GET returning full body as string.
 * Follows up to 5 redirects. No external deps.
 */
function httpGet(targetUrl) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, hops) => {
      if (hops <= 0) return reject(new Error('Too many redirects'));
      const mod = currentUrl.startsWith('https') ? https : http;
      const req = mod.get(currentUrl, {
        headers: {
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control':   'no-cache',
        },
      }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const loc = res.headers['location'];
          if (!loc) return reject(new Error('Redirect without Location header'));
          res.resume();
          return follow(loc.startsWith('http') ? loc : new URL(loc, currentUrl).href, hops - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const bufs = [];
        res.on('data', d => bufs.push(d));
        res.on('end',  () => resolve(Buffer.concat(bufs).toString('utf8')));
        res.on('error', reject);
      });
      req.on('error', reject);
    };
    follow(targetUrl, 5);
  });
}

/**
 * Download binary (PDF) to disk. Validates content-type to avoid HTML error pages.
 */
function downloadFile(targetUrl, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, hops) => {
      if (hops <= 0) return reject(new Error('Too many redirects'));
      const mod = currentUrl.startsWith('https') ? https : http;
      const req = mod.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer':    BASE_URL,
          'Accept':     'application/pdf,*/*',
        },
      }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const loc = res.headers['location'];
          if (!loc) return reject(new Error('Redirect without Location header'));
          res.resume();
          return follow(loc.startsWith('http') ? loc : new URL(loc, currentUrl).href, hops - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const ct = res.headers['content-type'] || '';
        if (ct.includes('text/html')) {
          res.resume();
          return reject(new Error('Server returned HTML instead of PDF'));
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', resolve);
        out.on('error',  reject);
        res.on('error',  reject);
      });
      req.on('error', reject);
    };
    follow(targetUrl, 5);
  });
}

/**
 * Extract all individual PYQ page links from a branch listing page.
 * Returns deduplicated array of absolute URLs.
 */
function extractPyqLinks(html, basePageUrl) {
  const links  = new Set();
  const hrefRe = /href=["']([^"'#][^"']*\.html)["']/gi;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1];
    if (raw.includes('pyqonline.com') ||
        raw.includes('youtube.com')   ||
        raw.includes('ray-india.com')) continue;

    try {
      const absUrl  = new URL(raw, basePageUrl).href;
      const pn      = new URL(absUrl).pathname;
      // Must be a deep sub-path (not root or a listing page itself)
      if (absUrl.startsWith(BASE_URL)        &&
          absUrl !== basePageUrl             &&
          pn.split('/').length >= 3          &&
          !pn.endsWith('-question-papers.html') &&
          !pn.endsWith('-papers.html')       &&
          pn !== '/') {
        links.add(absUrl);
      }
    } catch (_) { /* malformed URL — skip */ }
  }
  return [...links];
}

/**
 * Extract the first .pdf href from a PYQ detail page and resolve to absolute URL.
 */
function extractPdfLink(html, pageUrl) {
  const pdfRe = /href=["']([^"']*\.pdf)["']/gi;
  let m;
  while ((m = pdfRe.exec(html)) !== null) {
    const raw = m[1];
    if (raw.includes('pyqonline') || raw.includes('youtube')) continue;
    try { return new URL(raw, pageUrl).href; } catch (_) {}
  }
  return null;
}

/**
 * Extract the year from a slug string.
 * e.g. "cs-501-data-structures-dec-2023" → 2023
 *      "bt-401-mathematics-3-jun-2015"   → 2015
 * Returns null if no 4-digit year found.
 */
function extractYearFromSlug(slug) {
  const m = slug.match(/\b(20\d{2}|19\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Build safe output filename:
 *   RGPV_PYQ_<BRANCH>_<slug>.pdf
 */
function buildFilename(branchToken, slug) {
  return `RGPV_PYQ_${branchToken}_${slug}.pdf`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function scrape() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' RGPVMate — RGPV PYQ Scraper  (source: rgpvonline.com)');
  if (DRY_RUN)     console.log(' Mode  : DRY RUN  (no files will be downloaded)');
  if (ALL_YEARS)   console.log(' Years : ALL (no year filter)');
  else             console.log(` Years : ${MIN_YEAR} – ${CURRENT_YEAR}  (last 10 years)`);
  if (ONLY_BRANCH) console.log(` Filter: Branch = ${ONLY_BRANCH}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Ensure output directory exists
  if (!DRY_RUN) fs.mkdirSync(DOCS_DIR, { recursive: true });

  // Track already-downloaded files to support resuming interrupted runs
  const existing = new Set(
    fs.existsSync(DOCS_DIR)
      ? fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.pdf'))
      : []
  );

  if (existing.size > 0) {
    console.log(`📂 Already in documents/pyqs/: ${existing.size} file(s) — will be skipped\n`);
  }

  const stats = { downloaded: 0, skipped: 0, filtered: 0, noPdf: 0, errors: 0 };

  // Apply --branch filter
  const branches = ONLY_BRANCH
    ? BRANCH_SOURCES.filter(b => b.branch === ONLY_BRANCH)
    : BRANCH_SOURCES;

  if (branches.length === 0) {
    console.error(`❌  Unknown branch token "${ONLY_BRANCH}".`);
    console.error(`   Valid: ${BRANCH_SOURCES.map(b => b.branch).join(', ')}`);
    process.exit(1);
  }

  // ── Iterate each branch ──────────────────────────────────────────────────────
  for (const branchSrc of branches) {
    const listUrl = BASE_URL + branchSrc.listUrl;
    console.log(`\n${'─'.repeat(67)}`);
    console.log(`📚  ${branchSrc.label}  [${branchSrc.branch}]`);
    console.log(`    ${listUrl}`);
    console.log(`${'─'.repeat(67)}`);

    // Step 1 — Fetch the listing page
    let listHtml;
    try {
      listHtml = await httpGet(listUrl);
    } catch (err) {
      console.log(`  ⚠️  Cannot fetch listing page: ${err.message} — skipping`);
      stats.errors++;
      await sleep(DELAY_MS);
      continue;
    }

    // Step 2 — Extract all PYQ page links
    const pyqPageUrls = extractPyqLinks(listHtml, listUrl);
    console.log(`  📋 Found ${pyqPageUrls.length} PYQ page(s) on listing`);

    if (pyqPageUrls.length === 0) {
      console.log('  ℹ️  No PYQ links on this page — skipping');
      continue;
    }

    let branchDownloaded = 0;
    let branchFiltered   = 0;

    // Step 3 — Process each individual PYQ page
    for (const pyqPageUrl of pyqPageUrls) {
      const slug     = path.basename(pyqPageUrl, '.html');
      const year     = extractYearFromSlug(slug);
      const filename = buildFilename(branchSrc.branch, slug);

      // ── Year filter ─────────────────────────────────────────────────────────
      if (!ALL_YEARS) {
        if (year === null) {
          // Slug has no year → cannot determine age → skip to be safe
          if (DEBUG) console.log(`  ⏩ No year in slug, skipping: ${slug}`);
          stats.filtered++;
          branchFiltered++;
          continue;
        }
        if (year < MIN_YEAR) {
          if (DEBUG) console.log(`  ⏩ ${year} < ${MIN_YEAR}, skipping: ${slug}`);
          stats.filtered++;
          branchFiltered++;
          continue;
        }
      }

      // ── Already downloaded? ─────────────────────────────────────────────────
      if (existing.has(filename)) {
        if (DEBUG) console.log(`  ⏭️  Already exists: ${filename}`);
        stats.skipped++;
        continue;
      }

      await sleep(DELAY_MS);

      // ── Download with retries ───────────────────────────────────────────────
      let attempt = 0;
      let done    = false;

      while (!done && attempt < MAX_RETRIES) {
        attempt++;
        try {
          // Fetch the PYQ detail page
          const pyqHtml = await httpGet(pyqPageUrl);

          // Find the PDF link
          const pdfUrl = extractPdfLink(pyqHtml, pyqPageUrl);
          if (!pdfUrl) {
            console.log(`  ❓ No PDF link — ${slug}`);
            stats.noPdf++;
            done = true;
            break;
          }

          // Log what we're about to grab
          const yearTag = year ? ` (${year})` : '';
          console.log(`  📄 ${slug}${yearTag}`);
          if (DEBUG) console.log(`     pdf: ${pdfUrl}`);
          console.log(`     → ${filename}`);

          if (DRY_RUN) {
            stats.downloaded++;
            branchDownloaded++;
            done = true;
            break;
          }

          // Download the PDF file
          const destPath = path.join(DOCS_DIR, filename);
          await downloadFile(pdfUrl, destPath);

          // Sanity-check file size — reject tiny files (HTML error pages)
          const fileSize = fs.statSync(destPath).size;
          if (fileSize < 2048) {
            fs.unlinkSync(destPath);
            throw new Error(`File too small (${fileSize} B) — likely an error page`);
          }

          existing.add(filename);
          stats.downloaded++;
          branchDownloaded++;
          done = true;

        } catch (err) {
          if (attempt < MAX_RETRIES) {
            console.log(`  ⚠️  Attempt ${attempt}/${MAX_RETRIES} failed (${slug}): ${err.message} — retrying...`);
            await sleep(DELAY_MS * 3);
          } else {
            console.log(`  ❌ Giving up on ${slug}: ${err.message}`);
            // Clean up partial file if present
            try {
              const dp = path.join(DOCS_DIR, filename);
              if (fs.existsSync(dp)) fs.unlinkSync(dp);
            } catch (_) {}
            stats.errors++;
            done = true;
          }
        }
      }
    }

    // Per-branch summary
    const skippedByYear = ALL_YEARS ? 0 : branchFiltered;
    console.log(`\n  ✔  ${branchSrc.branch}: ${branchDownloaded} downloaded, ${skippedByYear} older-than-${MIN_YEAR} skipped`);
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(` PYQ Scrape ${DRY_RUN ? 'Dry-Run ' : ''}Complete`);
  console.log(`   Downloaded  : ${stats.downloaded}`);
  console.log(`   Skipped     : ${stats.skipped}   (already in documents/pyqs/)`);
  console.log(`   Filtered    : ${stats.filtered}   (outside ${MIN_YEAR}–${CURRENT_YEAR} window)`);
  console.log(`   No PDF link : ${stats.noPdf}`);
  console.log(`   Errors      : ${stats.errors}`);
  console.log('═══════════════════════════════════════════════════════════════════');

  if (!DRY_RUN && stats.downloaded > 0) {
    console.log(`\n✅ PYQs saved to: ${DOCS_DIR}`);
    console.log('   Next step   : npm run ingest');
  }

  if (stats.errors > 0) {
    console.log(`\n⚠️  ${stats.errors} file(s) failed. Re-run to retry (already-downloaded files are skipped).`);
  }
}

scrape().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
