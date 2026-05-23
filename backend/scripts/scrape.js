// scripts/scrape.js
// ─────────────────────────────────────────────────────────────────────────────
// RGPVMate — RGPV Syllabus Scraper
// Downloads all syllabi from frm_viewscheme.aspx and saves them with our
// standard naming convention into documents/syllabus/
//
// Usage:
//   node scripts/scrape.js                      ← scrape everything
//   node scripts/scrape.js --program BTECH       ← only one program
//   node scripts/scrape.js --dry-run             ← list what would download, no files
//
// Prerequisites (run once):
//   npm install --save-dev playwright
//   npx playwright install chromium
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { chromium } = require('playwright');
const path  = require('path');
const fs    = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL    = 'https://www.rgpv.ac.in/uni/frm_viewscheme.aspx';
const DOCS_DIR    = path.resolve(__dirname, '../../documents/syllabus');
const UNMAPPED_LOG = path.resolve(__dirname, '../../documents/unmapped_titles.txt');
const DELAY_MS    = 1500;  // polite delay between postbacks (ms)

// CLI flags
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const DEBUG       = args.includes('--debug');          // saves screenshots for inspection
const progIdx     = args.indexOf('--program');
const ONLY_PROG   = progIdx !== -1 ? args[progIdx + 1] : null;  // e.g. "BTECH"

// ── Program map ───────────────────────────────────────────────────────────────
// RGPV display name → our filename token
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
// These programs have no branch subdivision — the program itself IS the branch.
// For these we skip BRANCH_RULES entirely and use 'GENERAL' as the branch token.
const SINGLE_BRANCH_PROGRAMS = new Set([
  'MCA', 'MCA2', 'MCADUAL',          // MCA family
  'MBA', 'MBAINT',                    // MBA family
  // NOTE: MTECH, ME, MPHARM, MPHARMPCI are NOT here — they have sub-specialisations
  // and are handled by BRANCH_RULES below.
  'BPHARM', 'BPHARMPCI',             // B.Pharm variants (no sub-branches on RGPV)
  'PHARMD',                           // Pharm D. (year-based, no specialisation)
  'BARCH', 'MARCH', 'BDESIGN',       // Architecture / Design
  'MPLAN',                            // Planning
  'MTECHPT', 'BTECHPTDC', 'BEPTDC',  // Part-time / PTDC variants
  'DDIPG', 'DIPLOMA',                // Diploma
  'PHD', 'PHDENT', 'PGCMB',         // Research / PG cert
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
// Rules are ordered: most specific first to prevent false matches.
// e.g. "Computer Science and Business" must be checked before "Computer Science"
const BRANCH_RULES = [
  // ── Common-to-all patterns ────────────────────────────
  [/common\s+to\s+all|common\s+a[\/\s]?b\s+group/i,            'COMMON'],

  // ── CS specialisations (check before plain CSE) ───────
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

  // ── Robotics / Automation ─────────────────────────────
  [/automation\s+and\s+robotics/i,                              'AR'],
  [/robotics\s+and\s+mechatronics/i,                            'RM'],
  [/robotics\s+and\s+artificial/i,                              'RAI'],
  [/robotics/i,                                                  'RAI'],

  // ── Electronics sub-branches (check before plain EC) ──
  [/electronics\s+and\s+computer/i,                             'ECS'],
  [/electronics\s+and\s+instrumentation/i,                      'EI'],
  [/vlsi/i,                                                      'VLSI'],
  [/act\s*(\(|$)/i,                                             'ECACT'],
  [/electronics\s+and\s+communication/i,                        'EC'],

  // ── Electrical ────────────────────────────────────────
  [/electrical\s+and\s+electronics/i,                           'EEE'],
  [/electrical/i,                                                'EE'],

  // ── Computer Science (broad — after all specialisations)
  [/computer\s+science/i,                                        'CSE'],
  [/information\s+technology/i,                                  'IT'],

  // ── Mechanical / related ──────────────────────────────
  [/mechatronics/i,                                              'MECH'],
  [/aircraft/i,                                                  'AME'],
  [/electric\s+vehicle/i,                                       'EV'],
  [/automobile/i,                                                'AUTO'],
  [/mechanical/i,                                                'ME'],

  // ── Civil / Chemical / Mining ─────────────────────────
  [/civil/i,                                                     'CE'],
  [/chemical/i,                                                  'CH'],
  [/mining\s+and\s+mineral/i,                                   'MINMP'],
  [/mining/i,                                                    'MIN'],

  // ── Bio / Pharma ──────────────────────────────────────
  [/bio[\s\-]?medical/i,                                           'BM'],
  [/bio[\s\-]?technology|bio\s+tech\b/i,                          'BT'],

  // ── Agriculture ───────────────────────────────────────
  [/agriculture\s+technology/i,                                  'AG'],
  [/agriculture/i,                                               'AGE'],

  // ── Misc ──────────────────────────────────────────────
  [/fire\s+tech(?:nology)?(?:\s+and\s+safety)?/i,              'FIRE'],
  [/industrial\s+prod(?:uction)?/i,                              'IP'],
  [/industrial\s+engg?\.?(?:\s+and)?\s+management/i,            'IEM'],  // "Industrial Engg. and Management"
  [/industrial\s+engg?\.?\s+mgt/i,                              'IEM'],  // "Industrial Engg. Mgt,"
  [/information\s+tech(?:nology)?\.?/i,                         'IT'],   // "Information Tech", "Information Tech."
  [/computer\s+sc(?:ience)?\.?(?:\s+and)?(?:\s+engg?)?/i,       'CSE'],  // "Computer Sc.", "Computer Sc. and Engg."
  [/textile\s+(?:tech(?:nology)?|engg\.?|engineering)/i,        'TX'],
  [/aeronaut(?:ical|ic)/i,                                       'AME'],

  // ── BE / old-style branch abbreviations ───────────────
  // Titles like "B.E.(CS)", "BE(EC)", "EI (Grading System)", "B.E. EC New CBGS"
  // Must come AFTER all full-name rules to avoid false matches.
  [/\b(?:b\.?e\.?\s*\(\s*)?cse\s*\)?(?:\s|$|,|\()/i,           'CSE'],
  [/\b(?:b\.?e\.?\s*\(\s*)?cs\s*\)?(?:\s|$|,|\()/i,            'CSE'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ece\s*\)?(?:\s|$|,|\()/i,           'EC'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ec\s*\)?(?:\s|$|,|\()/i,            'EC'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ee\s*\)?(?:\s|$|,|\()/i,            'EE'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ei\s*\)?(?:\s|$|,|\()/i,            'EI'],
  [/\b(?:b\.?e\.?\s*\(\s*)?ex\s*\)?(?:\s|$|,|\()/i,            'EI'],  // EX = Electronics
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

  // ── MBA / PG specialisations ──────────────────────────
  [/pharmaceutical\s+management|pharma\s+management/i,          'PHARMA'],
  [/financial\s+administration|financial\s+admin/i,             'FA'],
  [/marketing\s+management|marketing\s+mgmt/i,                  'MM'],
  [/healthcare\s+management|health\s+care\s+management/i,       'HCM'],
  [/rural\s+management|rural\s+mgmt/i,                          'RM'],
  [/human\s+resource|hr\s+management/i,                         'HR'],
  [/international\s+business/i,                                  'IB'],
  [/operations\s+management/i,                                   'OM'],
  [/information\s+management/i,                                  'IM'],

  // ── Arch / Planning / Design ──────────────────────────
  [/architecture/i,                                              'ARCH'],
  [/urban\s+planning|town\s+planning/i,                         'PLAN'],
  [/fashion\s+design|textile\s+design/i,                        'DESIGN'],

  // ── M.Pharm specialisations (‘MPharm PCI …’ titles) ────────
  // Must come AFTER pharmaceutical\s+management (MBA) to avoid false match.
  [/pharmacy\s+practice/i,                                       'PHRMPRAC'],
  [/pharmacognosy/i,                                             'PHRMCOG'],
  [/pharmaceutical\s+quality|quality\s+assurance/i,             'PHRMQA'],
  [/regulatory\s+affairs/i,                                     'PHRMREG'],
  [/pharmaceutical\s+chem(?:istry)?/i,                          'PHRMCHEM'],
  [/pharmaceutics/i,                                             'PHARMD'],
  [/pharmacology/i,                                              'PHARMD'],

  // ── M.Pharm additional specialisations ──────────────────────
  [/pharmaceutical\s+analysis/i,                                'PHRMANAL'],
  [/pharmaceutical\s+tech(?:nology)?/i,                         'PHRMTECH'],
  [/ph(?:armaceutical)?\s*marketing/i,                          'PHRMKTG'],
  [/drug\s+regulatory|\bdra\b/i,                                'PHRMREG'],
  [/\bpmra\b|pharma\.?\s*mgmt/i,                                'PHRMAMGMT'],
  [/industrial\s+pharmacy/i,                                    'INDPHRM'],

  // ── M.Tech / M.E. specialisations ───────────────────────────
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
  [/advance\s+prod(?:uction)?(?:\s+sys(?:tem)?)?/i,             'APS'],   // "Advance Production System" with or without 'Sys'
  [/const(?:ruction)?\.?\s+tech(?:nology)?|const(?:ruction)?\s+plan/i, 'CONSTENG'],  // "Const. Tech."
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
  [/computer\s+sc(?:ience)?(?:\.)?(?:\s+and)?\s+engg?/i,        'CSE'],  // "Computer Sc. and Engg."
  [/industrial\s+engg?\.?\s+(?:and\s+)?management/i,            'IEM'],  // "Industrial Engg. and Management"

  // ── B.E. / B.Tech remaining patterns ────────────────────────
  [/artificial\s+intelligence/i,                                'CSEAI'],
  [/electronics?.*act\b/i,                                      'ECACT'],
  [/cbcs.*admitted|cbgs.*admitted|admitted.*students/i,         'COMMON'],
  [/b\.?e\.?\s+cbcs|b\.?e\.?\s+cbgs/i,                         'COMMON'],

  // ── Program-level single-doc catch-alls ─────────────────────
  [/m\.?c\.?a\.?/i,                                             'GENERAL'],
  [/master\s+of\s+applied\s+management/i,                       'MAM'],
  [/master.*business.*administration/i,                          'GENERAL'],
  [/master.*computer.*application/i,                            'GENERAL'],
  [/bachelor.*computer.*application/i,                          'GENERAL'],
  [/b\.?pharm?/i,                                               'GENERAL'],
  [/m\.?pharm?/i,                                               'GENERAL'],
  [/b\.?arch/i,                                                 'GENERAL'],
  [/pharm\s*d\.?/i,                                             'GENERAL'],

  // ── Absolute last-resort: matches everything ─────────────────
  // Files saved as UNKNOWN_* for manual review post-scrape.
  [/[\s\S]/,                                                     'UNKNOWN'],
];

function titleToBranchToken(title) {
  for (const [regex, token] of BRANCH_RULES) {
    if (regex.test(title)) return token;
  }
  return null;  // unmapped — will be logged
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "1 st Semester" / "2 nd Semester" → 1 / 2 */
function parseSemester(headerText) {
  const m = headerText.match(/(\d+)\s*(?:st|nd|rd|th)\s+semester/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Extract 4-digit year from title, e.g. "for 2022 Admitted" → "2022" */
function extractYear(title) {
  const m = title.match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

/** Build our standard filename */
function buildFilename(programToken, sysTypeToken, branchToken, semester, year) {
  const parts = ['RGPV', 'SYLLABUS', programToken, sysTypeToken];
  if (branchToken) parts.push(branchToken);
  if (semester)    parts.push(`SEM${semester}`);
  if (year)        parts.push(year);
  return parts.join('_') + '.pdf';
}

/** Sleep helper */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Append a line to the unmapped titles log */
function logUnmapped(line) {
  fs.appendFileSync(UNMAPPED_LOG, line + '\n', 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function scrape() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' RGPVMate — RGPV Syllabus Scraper');
  if (DRY_RUN)     console.log(' Mode: DRY RUN (no files will be downloaded)');
  if (ONLY_PROG)   console.log(` Filter: Program = ${ONLY_PROG}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Ensure output dir exists
  if (!DRY_RUN) fs.mkdirSync(DOCS_DIR, { recursive: true });

  // Clear unmapped log
  if (!DRY_RUN) fs.writeFileSync(UNMAPPED_LOG, `# Titles with no branch token match\n# Review and add rules to BRANCH_RULES in scrape.js\n\n`, 'utf8');

  // Track already-downloaded files to skip
  const existing = new Set(
    fs.existsSync(DOCS_DIR)
      ? fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.pdf'))
      : []
  );

  const stats = { downloaded: 0, skipped: 0, unmapped: 0, errors: 0 };

  // ── Launch browser ──────────────────────────────────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page    = await context.newPage();

  // Suppress console noise from the RGPV page
  page.on('console', () => {});
  page.on('pageerror', () => {});

  try {
    console.log('📡 Loading RGPV syllabus page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // ── Discover dropdown selectors ───────────────────────────────────────────
    // Find the "Upload Type" dropdown (contains "Scheme" and "Syllabus" options)
    const uploadTypeSelect = await page.$('select:has(option[value="1"]):has(option[value="2"])') ||
                             await page.$('select');

    // Find all <select> elements on the page
    const selects = await page.$$('select');
    if (selects.length < 3) {
      throw new Error(`Expected at least 3 dropdowns, found ${selects.length}`);
    }

    // RGPV page has: [Upload Type] [Program] [System Type] in order
    const [uploadTypeSel, programSel, systemTypeSel] = selects;

    // Set Upload Type = Syllabus
    // The page has two upload types: Scheme (value=1) and Syllabus (value=2)
    console.log('📋 Setting Upload Type = Syllabus\n');
    await page.selectOption('select', { label: 'Syllabus' });
    await page.waitForLoadState('networkidle');
    await sleep(DELAY_MS);
    if (DEBUG) await page.screenshot({ path: path.join(DOCS_DIR, '_debug_initial.png') });

    // ── Get all available Program options ─────────────────────────────────────
    const programOptions = await programSel.$$eval('option', opts =>
      opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
           .filter(o => o.value && o.text)
    );

    console.log(`🎓 Found ${programOptions.length} program(s)\n`);

    // ── Iterate each Program ──────────────────────────────────────────────────
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

      // Select this program
      const freshSelects0  = await page.$$('select');
      await freshSelects0[1].selectOption({ value: prog.value });
      await page.waitForLoadState('networkidle');
      await sleep(DELAY_MS);
      if (DEBUG) await page.screenshot({ path: path.join(DOCS_DIR, `_debug_${programToken}.png`) });

      // Re-query dropdowns (ASP.NET postback replaces DOM)
      const freshSelects   = await page.$$('select');
      const freshSysSel    = freshSelects[2];
      if (!freshSysSel) {
        console.log('  ⚠️  No system type dropdown found, skipping');
        continue;
      }

      // Get System Type options for this program
      const sysOptions = await freshSysSel.$$eval('option', opts =>
        opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
             .filter(o => o.value && o.text)
      );

      // ── Iterate each System Type ────────────────────────────────────────────
      for (const sys of sysOptions) {
        const sysToken = SYSTEM_TYPE_MAP[sys.text];
        if (!sysToken) {
          console.log(`  ⚠️  Unknown system type "${sys.text}" — skipping`);
          continue;
        }

        console.log(`\n  🔧 System Type: ${sys.text} (${sysToken})`);

        // Select system type using page.locator() — lazily resolves the element
        // every time it is interacted with, so it never goes stale after a postback.
        await page.locator('select').nth(2).selectOption({ value: sys.value });
        await page.waitForLoadState('networkidle');
        await sleep(DELAY_MS);
        if (DEBUG) await page.screenshot({ path: path.join(DOCS_DIR, `_debug_${programToken}_${sysToken}.png`) });

        // ── Parse document table ──────────────────────────────────────────────
        // Target the specific ASP.NET GridView by its rendered ID.
        // ASP.NET WebForms renders ContentPlaceHolder1$gvViewAct as:
        //   ContentPlaceHolder1_gvViewAct
        let rowSelector  = '#ContentPlaceHolder1_gvViewAct tr, #ctl00_ContentPlaceHolder1_gvViewAct tr';
        let rowCount     = await page.locator(rowSelector).count();

        if (rowCount === 0) {
          // Fallback: scan all table rows if the specific ID isn't found
          console.log(`  ℹ️  GridView not found by ID, falling back to all table rows`);
          rowSelector = 'table tr';
          rowCount     = await page.locator(rowSelector).count();
        }

        let currentSemester = null;
        // Dedup set: prevents processing the same (title + semester) twice.
        // RGPV's GridView sometimes renders a row twice (header row + data row).
        const seenInBatch = new Set();

        for (let i = 0; i < rowCount; i++) {
          const row = page.locator(rowSelector).nth(i);
          const rowText = (await row.innerText()).trim();
          if (!rowText) continue;

          // Check if this is a semester header row ("1 st Semester", "2 nd Semester" ...)
          const semNum = parseSemester(rowText);
          if (semNum) {
            currentSemester = semNum;
            continue;
          }

          // Check if this row has a download link/button (has a PDF download target)
          const downloadBtn = row.locator('a[href], input[type="submit"], button').first();
          const hasDownloadBtn = (await downloadBtn.count()) > 0;
          if (!hasDownloadBtn || currentSemester === null) continue;

          // Get the document display title
          let titleEl = row.locator('td:last-child').first();
          if ((await titleEl.count()) === 0) {
            titleEl = row.locator('td').first();
          }
          const hasTitleEl = (await titleEl.count()) > 0;
          const title   = hasTitleEl ? (await titleEl.innerText()).trim() : rowText;

          if (!title || title.toLowerCase().includes('semester')) continue;

          // Deduplicate: skip if we've already seen this title in this batch
          const dedupKey = `${currentSemester}|${title}`;
          if (seenInBatch.has(dedupKey)) continue;
          seenInBatch.add(dedupKey);

          // Map title to branch token.
          // Single-branch programs skip regex detection entirely → 'GENERAL'.
          // Multi-branch programs run BRANCH_RULES; truly unknown ones are logged.
          const branchToken = SINGLE_BRANCH_PROGRAMS.has(programToken)
            ? 'GENERAL'
            : titleToBranchToken(title);
          const yearHint    = extractYear(title);

          if (!branchToken) {
            const msg = `[${programToken}][${sysToken}][SEM${currentSemester}] "${title}"`;
            console.log(`  ❓ Unmapped: ${msg}`);
            logUnmapped(msg);
            stats.unmapped++;
            continue;
          }

          // Build target filename, appending a numeric suffix to avoid collisions
          // when multiple specialisations map to the same branch token + semester.
          let filename = buildFilename(programToken, sysToken, branchToken, currentSemester, yearHint);
          let collisionCount = 1;
          while (seenInBatch.has(`FILE:${filename}`) || existing.has(filename)) {
            collisionCount++;
            filename = buildFilename(programToken, sysToken, `${branchToken}_${collisionCount}`, currentSemester, yearHint);
          }
          seenInBatch.add(`FILE:${filename}`);

          if (existing.has(filename)) {
            console.log(`  ⏭️  [SEM${currentSemester}] ${branchToken} — already exists`);
            stats.skipped++;
            continue;
          }

          console.log(`  📄 [SEM${currentSemester}] ${branchToken}${yearHint ? ` (${yearHint})` : ''} → ${filename}`);
          if (branchToken === 'UNKNOWN') console.log(`      ↳ title: "${title}"`);

          if (DRY_RUN) {
            stats.downloaded++;
            continue;
          }

          // ── Download the PDF ────────────────────────────────────────────────
          const maxRetries = 3;
          let success = false;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              const destPath = path.join(DOCS_DIR, filename);

              const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 60000 }), // 60 seconds timeout
                downloadBtn.click(),
              ]);

              await download.saveAs(destPath);
              existing.add(filename);  // mark as downloaded for this run
              stats.downloaded++;
              success = true;

              // Wait for page to settle after download postback
              await page.waitForLoadState('networkidle').catch(() => {});
              await sleep(DELAY_MS);
              break; // exit retry loop on success

            } catch (dlErr) {
              console.log(`  ⚠️  Download attempt ${attempt}/${maxRetries} failed: ${dlErr.message}`);
              if (attempt < maxRetries) {
                const backoff = attempt * 3000;
                console.log(`      Retrying in ${backoff / 1000}s...`);
                await sleep(backoff);
              } else {
                console.log(`  ❌ Download failed after ${maxRetries} attempts.`);
                stats.errors++;
              }
            }
          }
        }
      }
    }

  } finally {
    await browser.close();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` Scrape ${DRY_RUN ? 'Dry Run ' : ''}Complete`);
  console.log(`   Downloaded : ${stats.downloaded}`);
  console.log(`   Skipped    : ${stats.skipped}  (already existed)`);
  console.log(`   Unmapped   : ${stats.unmapped}  (check unmapped_titles.txt)`);
  console.log(`   Errors     : ${stats.errors}`);
  console.log('═══════════════════════════════════════════════════════════');

  if (stats.unmapped > 0) {
    console.log(`\n⚠️  ${stats.unmapped} title(s) had no branch match.`);
    console.log(`   Review: ${UNMAPPED_LOG}`);
    console.log(`   Then add a regex rule to BRANCH_RULES in scrape.js and re-run.`);
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
