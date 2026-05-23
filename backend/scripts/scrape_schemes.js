// scripts/scrape_schemes.js
// ─────────────────────────────────────────────────────────────────────────────
// RGPVMate — RGPV Scheme Scraper
// Downloads all schemes from frm_viewscheme.aspx and saves them with our
// standard naming convention into documents/scheme/
//
// Usage:
//   node scripts/scrape_schemes.js                      ← scrape everything
//   node scripts/scrape_schemes.js --program BTECH       ← only one program
//   node scripts/scrape_schemes.js --dry-run             ← list what would download, no files
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { chromium } = require('playwright');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL    = 'https://www.rgpv.ac.in/uni/frm_viewscheme.aspx';
const DOCS_DIR    = path.resolve(__dirname, '../../documents/scheme');
const UNMAPPED_LOG = path.resolve(__dirname, '../../documents/unmapped_scheme_titles.txt');
const DELAY_MS    = 1500;  // polite delay between postbacks (ms)

// CLI flags
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const DEBUG       = args.includes('--debug');          // saves screenshots for inspection
const progIdx     = args.indexOf('--program');
const ONLY_PROG   = progIdx !== -1 ? args[progIdx + 1] : null;  // e.g. "BTECH"

// ── Program map ───────────────────────────────────────────────────────────────
const PROGRAM_MAP = {
  'B.Tech':             'BTECH',
  'B.Tech.-PTDC':       'BTECHPTDC',
  'M.Tech.':            'MTECH',
  'M.Tech.(Part Time)': 'MTECHPT',
  'M.E.':               'ME',
  'MCA':                'MCA',
  'MCA 2 Year':         'MCA2',
  'MCA Dual Degree':    'MCADUAL',
  'MBA':                'MBA',
  'MBA Integrated':     'MBAINT',
  'B.Pharm':            'BPHARM',
  'B.Pharm.(PCI)':      'BPHARMPCI',
  'M.Pharm':            'MPHARM',
  'M.Pharm. PCI':       'MPHARMPCI',
  'Pharm D.':           'PHARMD',
  'B.Arch':             'BARCH',
  'M.Arch':             'MARCH',
  'B.Design':           'BDESIGN',
  'BE':                 'BE',
  'BE-PTDC':            'BEPTDC',
  'M.Plan':             'MPLAN',
  'Diploma':            'DIPLOMA',
  'Ph.D.':              'PHD',
  'Ph.D. Entrance':     'PHDENT',
  'PGCMB':              'PGCMB',
  'DDI-PG':             'DDIPG',
};

// ── Single-branch programs ────────────────────────────────────────────────────
const SINGLE_BRANCH_PROGRAMS = new Set([
  'MCA', 'MCA2', 'MCADUAL',
  'MBA', 'MBAINT',
  'BPHARM', 'BPHARMPCI',
  'PHARMD',
  'BARCH', 'MARCH', 'BDESIGN',
  'MPLAN',
  'MTECHPT', 'BTECHPTDC', 'BEPTDC',
  'DDIPG', 'DIPLOMA',
  'PHD', 'PHDENT', 'PGCMB',
]);

// ── System Type map ───────────────────────────────────────────────────────────
const SYSTEM_TYPE_MAP = {
  'Grading System':     'GRADING',
  'Non Grading System': 'NONGRADING',
  'Lateral Entry':      'LATERALENTRY',
  'CBCS':               'CBCS',
  'CBGS':               'CBGS',
  'As per COA':         'COA',
};

// ── Title → Branch token (fuzzy keyword matching) ─────────────────────────────
const BRANCH_RULES = [
  [/common\s+to\s+all|common\s+a[\/\s]?b\s+group/i,            'COMMON'],
  [/computer\s+science\s+and\s+business/i,                      'CSBS'],
  [/computer\s+science\s+and\s+information/i,                   'CSIT'],
  [/computer\s+science\s+and\s+design/i,                        'CSD'],
  [/cse\s+.*iot.*cyber.*block|cyber.*block.*iot/i,              'CSBCHAIN'],
  [/cyber\s+security/i,                                          'CSSEC'],
  [/iot|internet\s+of\s+things/i,                               'IOT'],
  [/artificial\s+intelligence\s+and\s+data|ai\s+and\s+data/i,   'AIDS'],
  [/data\s+science/i,                                            'DS'],
  [/ai\s+and\s+machine\s+learning/i,                            'AIML'],
  [/cse\s+artificial\s+intelligence|cse\s*ai/i,                 'CSEAI'],
  [/3d\s+animation/i,                                            '3DANIM'],
  [/automation\s+and\s+robotics/i,                              'AR'],
  [/robotics\s+and\s+mechatronics/i,                            'RM'],
  [/robotics\s+and\s+artificial/i,                              'RAI'],
  [/robotics/i,                                                  'RAI'],
  [/electronics\s+and\s+computer/i,                             'ECS'],
  [/electronics\s+and\s+instrumentation/i,                      'EI'],
  [/vlsi/i,                                                      'VLSI'],
  [/act\s*(\(|$)/i,                                             'ECACT'],
  [/electronics\s+and\s+communication/i,                        'EC'],
  [/electrical\s+and\s+electronics/i,                           'EEE'],
  [/electrical/i,                                                'EE'],
  [/computer\s+science/i,                                        'CSE'],
  [/information\s+technology/i,                                  'IT'],
  [/mechatronics/i,                                              'MECH'],
  [/aircraft/i,                                                  'AME'],
  [/electric\s+vehicle/i,                                       'EV'],
  [/automobile/i,                                                'AUTO'],
  [/mechanical/i,                                                'ME'],
  [/civil/i,                                                     'CE'],
  [/chemical/i,                                                  'CH'],
  [/mining\s+and\s+mineral/i,                                   'MINMP'],
  [/mining/i,                                                    'MIN'],
  [/bio[\s\-]?medical/i,                                           'BM'],
  [/bio[\s\-]?technology|bio\s+tech\b/i,                          'BT'],
  [/agriculture\s+technology/i,                                  'AG'],
  [/agriculture/i,                                               'AGE'],
  [/fire\s+tech(?:nology)?(?:\s+and\s+safety)?/i,              'FIRE'],
  [/industrial\s+prod(?:uction)?/i,                              'IP'],
  [/industrial\s+engg?\.?(?:\s+and)?\s+management/i,            'IEM'],
  [/industrial\s+engg?\.?\s+mgt/i,                              'IEM'],
  [/information\s+tech(?:nology)?\.?/i,                         'IT'],
  [/computer\s+sc(?:ience)?\.?(?:\s+and)?(?:\s+engg?)?/i,       'CSE'],
  [/textile\s+(?:tech(?:nology)?|engg\.?|engineering)/i,        'TX'],
  [/aeronaut(?:ical|ic)/i,                                       'AME'],
  [/\b(?:b\.?e\.?\s*\(\s*)?cse\s*\)?(?:\s|$|,|\()/i,           'CSE'],
  [/\b(?:b\.?e\.?\s*\(\s*)?cs\s*\)?(?:\s|$|,|\()/i,            'CSE'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ece\s*\)?(?:\s|$|,|\()/i,           'EC'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ec\s*\)?(?:\s|$|,|\()/i,            'EC'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ee\s*\)?(?:\s|$|,|\()/i,            'EE'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ei\s*\)?(?:\s|$|,|\()/i,            'EI'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ex\s*\)?(?:\s|$|,|\()/i,            'EI'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ft\s*\)?(?:\s|$|,|\()/i,            'FIRE'],
  [/\b(?:b\.?e\.?\s*\(\s*)?it\s*\)?(?:\s|$|,|\()/i,            'IT'],
  [/\b(?:b\.?e\.?\s*\(\s*)?me\s*\)?(?:\s|$|,|\()/i,            'ME'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ce\s*\)?(?:\s|$|,|\()/i,            'CE'],
  [/\b(?:b\.?e\.?\s*\(\s*)?au\s*\)?(?:\s|$|,|\()/i,            'AUTO'],
  [/\b(?:b\.?e\.?\s*\(\s*)?bm\s*\)?(?:\s|$|,|\()/i,            'BM'],
  [/\b(?:b\.?e\.?\s*\(\s*)?bt\s*\)?(?:\s|$|,|\()/i,            'BT'],
  [/\b(?:b\.?e\.?\s*\(\s*)?cm\s*\)?(?:\s|$|,|\()/i,            'MIN'],
  [/\b(?:b\.?e\.?\s*\(\s*)?tx\s*\)?(?:\s|$|,|\()/i,            'TX'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ip(?:e)?\s*\)?(?:\s|$|,|\()/i,      'IP'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ie(?:m)?\s*\)?(?:\s|$|,|\()/i,      'IP'],
  [/\b(?:b\.?e\.?\s*\(?\s*)?minin/i,                            'MIN'],
  [/pharmaceutical\s+management|pharma\s+management/i,          'PHARMA'],
  [/financial\s+administration|financial\s+admin/i,             'FA'],
  [/marketing\s+management|marketing\s+mgmt/i,                  'MM'],
  [/healthcare\s+management|health\s+care\s+management/i,       'HCM'],
  [/rural\s+management|rural\s+mgmt/i,                          'RM'],
  [/human\s+resource|hr\s+management/i,                         'HR'],
  [/international\s+business/i,                                  'IB'],
  [/operations\s+management/i,                                   'OM'],
  [/information\s+management/i,                                  'IM'],
  [/architecture/i,                                              'ARCH'],
  [/urban\s+planning|town\s+planning/i,                         'PLAN'],
  [/fashion\s+design|textile\s+design/i,                        'DESIGN'],
  [/pharmacy\s+practice/i,                                       'PHRMPRAC'],
  [/pharmacognosy/i,                                             'PHRMCOG'],
  [/pharmaceutical\s+quality|quality\s+assurance/i,             'PHRMQA'],
  [/regulatory\s+affairs/i,                                     'PHRMREG'],
  [/pharmaceutical\s+chem(?:istry)?/i,                          'PHRMCHEM'],
  [/pharmaceutics/i,                                             'PHARMD'],
  [/pharmacology/i,                                              'PHARMD'],
  [/pharmaceutical\s+analysis/i,                                'PHRMANAL'],
  [/pharmaceutical\s+tech(?:nology)?/i,                         'PHRMTECH'],
  [/ph(?:armaceutical)?\s*marketing/i,                          'PHRMKTG'],
  [/drug\s+regulatory|\bdra\b/i,                                'PHRMREG'],
  [/\bpmra\b|pharma\.?\s*mgmt/i,                                'PHRMAMGMT'],
  [/industrial\s+pharmacy/i,                                    'INDPHRM'],
  [/power\s+system\s+auto(?:mation)?/i,                         'PSA'],
  [/power\s+system/i,                                           'PWRSYS'],
  [/power\s+elec(?:tronics)?/i,                                 'PWRELEC'],
  [/high\s+voltage/i,                                           'HVPS'],
  [/control\s+system/i,                                         'CTRLSYS'],
  [/machine\s+design/i,                                         'MCHDES'],
  [/structural\s+engg?/i,                                       'STRENG'],
  [/thermal\s+engg?|heat\s+power/i,                             'THERMAL'],
  [/production\s+engg?(?:\.|ineering)?/i,                       'PRODENG'],
  [/adv\.?\s+prod(?:uction)?\s+sys/i,                           'APS'],
  [/advance\s+prod(?:uction)?(?:\s+sys(?:tem)?)?/i,             'APS'],
  [/const(?:ruction)?\.?\s+tech(?:nology)?|const(?:ruction)?\s+plan/i, 'CONSTENG'],
  [/computer\s+integrated\s+m(?:fg|anuf)/i,                     'CIM'],
  [/cad\s*[-\/]?\s*cam/i,                                       'CADCAM'],
  [/digital\s+comm(?:unication)?/i,                             'DIGCOM'],
  [/digital\s+electronics/i,                                    'DIGELEC'],
  [/digital\s+instrument/i,                                     'DIGINST'],
  [/microwave/i,                                                 'MICROWAVE'],
  [/transport(?:ation)?\s+engg?/i,                              'TRANSENG'],
  [/construction\s+(?:tech|planning|mgt|mgmt|management)/i,     'CONSTENG'],
  [/building\s+construction/i,                                  'CONSTENG'],
  [/industrial\s+design/i,                                      'INDDES'],
  [/industrial\s+safety/i,                                      'INDSAFE'],
  [/energy\s+tech(?:nology)?/i,                                 'ENETECH'],
  [/environmental\s+engg?/i,                                    'ENVENG'],
  [/nanotechnology/i,                                           'NANO'],
  [/software\s+(?:engg?|system)/i,                              'SWENG'],
  [/cta|computer\s+tech.*app/i,                                 'CTATECH'],
  [/urban.*regional.*planning|m\.?\s*plan\b/i,                  'URPPLAN'],
  [/production\s+and\s+ind/i,                                   'APS'],
  [/computer\s+sc(?:ience)?(?:\.)?(?:\s+and)?\s+engg?/i,        'CSE'],
  [/industrial\s+engg?\.?\s+(?:and\s+)?management/i,            'IEM'],
  [/artificial\s+intelligence/i,                                'CSEAI'],
  [/electronics?.*act\b/i,                                      'ECACT'],
  [/cbcs.*admitted|cbgs.*admitted|admitted.*students/i,         'COMMON'],
  [/b\.?e\.?\s+cbcs|b\.?e\.?\s+cbgs/i,                         'COMMON'],
  [/m\.?c\.?a\.?/i,                                             'GENERAL'],
  [/master\s+of\s+applied\s+management/i,                       'MAM'],
  [/master.*business.*administration/i,                          'GENERAL'],
  [/master.*computer.*application/i,                            'GENERAL'],
  [/bachelor.*computer.*application/i,                          'GENERAL'],
  [/b\.?pharm?/i,                                               'GENERAL'],
  [/m\.?pharm?/i,                                               'GENERAL'],
  [/b\.?arch/i,                                                 'GENERAL'],
  [/pharm\s*d\.?/i,                                             'GENERAL'],
  [/[\s\S]/,                                                     'UNKNOWN'],
];

function titleToBranchToken(title) {
  for (const [regex, token] of BRANCH_RULES) {
    if (regex.test(title)) return token;
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSemester(headerText) {
  const m = headerText.match(/(\d+)\s*(?:st|nd|rd|th)\s+semester/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractYear(title) {
  const m = title.match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

function buildFilename(programToken, sysTypeToken, branchToken, semester, year) {
  const parts = ['RGPV', 'SCHEME', programToken, sysTypeToken];
  if (branchToken) parts.push(branchToken);
  if (semester)    parts.push(`SEM${semester}`);
  if (year)        parts.push(year);
  return parts.join('_') + '.pdf';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function logUnmapped(line) {
  fs.appendFileSync(UNMAPPED_LOG, line + '\n', 'utf8');
}

function downloadFromUrl(url, destPath, cookieStr) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, remaining) => {
      if (remaining <= 0) return reject(new Error('Too many redirects'));
      const mod = currentUrl.startsWith('https') ? https : http;
      const req = mod.get(currentUrl, {
        headers: {
          'Cookie': cookieStr,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': BASE_URL,
        }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const location = res.headers['location'];
          if (!location) return reject(new Error('Redirect with no Location header'));
          const redirectUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
          res.resume();
          return follow(redirectUrl, remaining - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
    };
    follow(url, 5);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function scrape() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' RGPVMate — RGPV Scheme Scraper');
  if (DRY_RUN)     console.log(' Mode: DRY RUN (no files will be downloaded)');
  if (ONLY_PROG)   console.log(` Filter: Program = ${ONLY_PROG}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!DRY_RUN) fs.mkdirSync(DOCS_DIR, { recursive: true });

  if (!DRY_RUN) fs.writeFileSync(UNMAPPED_LOG, `# Titles with no branch token match\n\n`, 'utf8');

  const existing = new Set(
    fs.existsSync(DOCS_DIR)
      ? fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.pdf'))
      : []
  );

  const stats = { downloaded: 0, skipped: 0, unmapped: 0, errors: 0 };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page    = await context.newPage();

  page.on('console', () => {});
  page.on('pageerror', () => {});

  let capturedPdfUrl = null;
  context.on('request', req => {
    if (req.url().includes('frm_download_file.aspx')) {
      capturedPdfUrl = req.url();
    }
  });

  try {
    console.log('📡 Loading RGPV syllabus/scheme page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const selects = await page.$$('select');
    if (selects.length < 3) {
      throw new Error(`Expected at least 3 dropdowns, found ${selects.length}`);
    }

    const [uploadTypeSel, programSel, systemTypeSel] = selects;

    // Set Upload Type = Scheme (value=1)
    console.log('📋 Setting Upload Type = Scheme\n');
    await page.selectOption('select', { label: 'Scheme' });
    await page.waitForLoadState('networkidle');
    await sleep(DELAY_MS);
    if (DEBUG) await page.screenshot({ path: path.join(DOCS_DIR, '_debug_initial.png') });

    const programOptions = await programSel.$$eval('option', opts =>
      opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
           .filter(o => o.value && o.text)
    );

    console.log(`🎓 Found ${programOptions.length} program(s)\n`);

    for (const prog of programOptions) {
      const programToken = PROGRAM_MAP[prog.text];
      if (!programToken) {
        console.log(`⚠️  Unknown program "${prog.text}" — skipping`);
        continue;
      }
      if (ONLY_PROG && programToken !== ONLY_PROG) continue;

      console.log(`\n${'─'.repeat(55)}`);
      console.log(`📚 Program: ${prog.text} (${programToken})`);
      console.log(`${'─'.repeat(55)}`);

      // Re-select Program
      const freshSelects0  = await page.$$('select');
      await freshSelects0[1].selectOption({ value: prog.value });
      await page.waitForLoadState('networkidle');
      await sleep(DELAY_MS);
      if (DEBUG) await page.screenshot({ path: path.join(DOCS_DIR, `_debug_${programToken}.png`) });

      const freshSelects   = await page.$$('select');
      const freshSysSel    = freshSelects[2];
      if (!freshSysSel) {
        console.log('  ⚠️  No system type dropdown found, skipping');
        continue;
      }

      const sysOptions = await freshSysSel.$$eval('option', opts =>
        opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
             .filter(o => o.value && o.text)
      );

      for (const sys of sysOptions) {
        const sysToken = SYSTEM_TYPE_MAP[sys.text];
        if (!sysToken) {
          console.log(`  ⚠️  Unknown system type "${sys.text}" — skipping`);
          continue;
        }

        console.log(`\n  🔧 System Type: ${sys.text} (${sysToken})`);

        // Helper to restore page state if ASP.NET AJAX gets corrupted or times out
        const restoreState = async () => {
          console.log(`  🔄 Restoring page state for ${programToken} - ${sysToken}...`);
          try {
            await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
            await page.selectOption('select', { label: 'Scheme' });
            await page.waitForLoadState('networkidle');
            await sleep(DELAY_MS);

            const freshSelects0 = await page.$$('select');
            await freshSelects0[1].selectOption({ value: prog.value });
            await page.waitForLoadState('networkidle');
            await sleep(DELAY_MS);

            await page.locator('select').nth(2).selectOption({ value: sys.value });
            await page.waitForLoadState('networkidle');
            await sleep(DELAY_MS);
          } catch (restoreErr) {
            console.log(`  ❌ Failed to restore state: ${restoreErr.message}`);
          }
        };

        await page.locator('select').nth(2).selectOption({ value: sys.value });
        await page.waitForLoadState('networkidle');
        await sleep(DELAY_MS);
        if (DEBUG) await page.screenshot({ path: path.join(DOCS_DIR, `_debug_${programToken}_${sysToken}.png`) });

        let rowSelector  = '#ContentPlaceHolder1_gvViewAct tr, #ctl00_ContentPlaceHolder1_gvViewAct tr';
        let rowCount     = await page.locator(rowSelector).count();

        if (rowCount === 0) {
          rowSelector = 'table tr';
          rowCount     = await page.locator(rowSelector).count();
        }

        let currentSemester = null;
        const seenInBatch = new Set();

        for (let i = 0; i < rowCount; i++) {
          let retryCount = 0;
          const maxRetries = 2;
          let success = false;

          while (!success && retryCount <= maxRetries) {
            try {
              const row = page.locator(rowSelector).nth(i);
              
              const rowText = (await row.innerText({ timeout: 5000 })).trim();
              if (!rowText) {
                success = true;
                break;
              }

              const semNum = parseSemester(rowText);
              if (semNum) {
                currentSemester = semNum;
                success = true;
                break;
              }

              const downloadBtn = row.locator('a[href*="doPostBack"], input[type="submit"], button').first();
              const hasDownloadBtn = (await downloadBtn.count()) > 0;
              if (!hasDownloadBtn || currentSemester === null) {
                success = true;
                break;
              }

              const btnHref = (await downloadBtn.getAttribute('href')) ?? '';
              if (btnHref && seenInBatch.has(`HREF:${btnHref}`)) {
                success = true;
                break;
              }
              if (btnHref) seenInBatch.add(`HREF:${btnHref}`);

              let titleEl = row.locator('td:last-child').first();
              if ((await titleEl.count()) === 0) {
                titleEl = row.locator('td').first();
              }
              const hasTitleEl = (await titleEl.count()) > 0;
              const title   = hasTitleEl ? (await titleEl.innerText()).trim() : rowText;

              if (!title || title.toLowerCase().includes('semester')) {
                success = true;
                break;
              }

              const dedupKey = `${currentSemester}|${title}`;
              if (seenInBatch.has(dedupKey)) {
                success = true;
                break;
              }
              seenInBatch.add(dedupKey);

              const branchToken = SINGLE_BRANCH_PROGRAMS.has(programToken)
                ? 'GENERAL'
                : titleToBranchToken(title);
              const yearHint    = extractYear(title);

              if (!branchToken) {
                const msg = `[${programToken}][${sysToken}][SEM${currentSemester}] "${title}"`;
                console.log(`  ❓ Unmapped: ${msg}`);
                logUnmapped(msg);
                stats.unmapped++;
                success = true;
                break;
              }

              let filename = buildFilename(programToken, sysToken, branchToken, currentSemester, yearHint);
              let collisionCount = 1;
              while (seenInBatch.has(`FILE:${filename}`)) {
                collisionCount++;
                filename = buildFilename(programToken, sysToken, `${branchToken}_${collisionCount}`, currentSemester, yearHint);
              }
              seenInBatch.add(`FILE:${filename}`);

              if (existing.has(filename)) {
                console.log(`  ⏭️  [SEM${currentSemester}] ${branchToken} — already exists`);
                stats.skipped++;
                success = true;
                break;
              }

              console.log(`  📄 [SEM${currentSemester}] ${branchToken}${yearHint ? ` (${yearHint})` : ''} → ${filename}`);
              if (branchToken === 'UNKNOWN') console.log(`      ↳ title: "${title}"`);

              if (DRY_RUN) {
                stats.downloaded++;
                success = true;
                break;
              }

              capturedPdfUrl = null;
              const destPath = path.join(DOCS_DIR, filename);

              await downloadBtn.click();

              const deadline = Date.now() + 15000;
              while (!capturedPdfUrl && Date.now() < deadline) {
                await sleep(200);
              }

              if (!capturedPdfUrl) {
                throw new Error('PDF URL not captured within 15s — no download request seen');
              }

              const cookies = await context.cookies('https://www.rgpv.ac.in');
              const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
              const pdfUrl = capturedPdfUrl.startsWith('http')
                ? capturedPdfUrl
                : `https://www.rgpv.ac.in${capturedPdfUrl}`;

              await downloadFromUrl(pdfUrl, destPath, cookieStr);

              existing.add(filename);
              stats.downloaded++;

              try {
                await page.waitForLoadState('networkidle', { timeout: 5000 });
              } catch (idleErr) {}
              await sleep(DELAY_MS);
              success = true;

            } catch (err) {
              retryCount++;
              console.log(`  ⚠️  Error processing row ${i} (attempt ${retryCount}/${maxRetries + 1}): ${err.message}`);
              
              try {
                const branchToken = SINGLE_BRANCH_PROGRAMS.has(programToken) ? 'GENERAL' : 'UNKNOWN';
                let filename = buildFilename(programToken, sysToken, branchToken, currentSemester || 0, yearHint || null);
                const destPath = path.join(DOCS_DIR, filename);
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              } catch (cleanupErr) {}

              if (retryCount <= maxRetries) {
                await restoreState();
                let freshCount = await page.locator(rowSelector).count();
                if (freshCount === 0) {
                  rowSelector = 'table tr';
                  freshCount = await page.locator(rowSelector).count();
                }
                rowCount = freshCount;
              } else {
                console.log(`  ❌ Row ${i} failed repeatedly. Moving to next row.`);
                stats.errors++;
                success = true;
              }
            }
          }
        }
      }
    }

  } finally {
    await browser.close();
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` Scrape ${DRY_RUN ? 'Dry Run ' : ''}Complete`);
  console.log(`   Downloaded : ${stats.downloaded}`);
  console.log(`   Skipped    : ${stats.skipped}  (already existed)`);
  console.log(`   Unmapped   : ${stats.unmapped}  (check unmapped_scheme_titles.txt)`);
  console.log(`   Errors     : ${stats.errors}`);
  console.log('═══════════════════════════════════════════════════════════');

  if (stats.unmapped > 0) {
    console.log(`\n⚠️  ${stats.unmapped} title(s) had no branch match.`);
  }
  if (!DRY_RUN && stats.downloaded > 0) {
    console.log(`\n✅ Files saved to: ${DOCS_DIR}`);
    console.log(`   Now run: npm run ingest`);
  }
}

scrape().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
