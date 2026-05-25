// scripts/schedule_notices.js
// ─────────────────────────────────────────────────────────────────────────────
// RGPVMate — Notice Automation Scheduler  (Phase 4.5)
//
// Runs as a long-lived Node.js process.
// Uses node-cron to trigger scrape_notices.js on a schedule.
//
// Default schedule: every day at 6:00 AM IST (00:30 UTC)
// You can override with the NOTICE_CRON_SCHEDULE env variable.
//
// Usage:
//   node scripts/schedule_notices.js              ← start the scheduler
//   node scripts/schedule_notices.js --run-now    ← run once immediately then schedule
//
// Keep this alive via:
//   pm2 start scripts/schedule_notices.js --name "notice-scheduler"
//   — or —
//   The Express server already requires this via index.js (if NOTICE_AUTO_SCHEDULE=true)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config();

const cron  = require('node-cron');
const { execFile } = require('child_process');
const path  = require('path');

// ── Config ─────────────────────────────────────────────────────────────────────
// Default: 6:00 AM IST = 00:30 UTC  →  '30 0 * * *'
const CRON_SCHEDULE = process.env.NOTICE_CRON_SCHEDULE || '30 0 * * *';
const SCRAPER_PATH  = path.resolve(__dirname, 'scrape_notices.js');
const RUN_NOW       = process.argv.includes('--run-now');

// ── Runner ─────────────────────────────────────────────────────────────────────
function runScraper(label = 'Scheduled') {
  return new Promise((resolve) => {
    const startTime = new Date().toISOString();
    console.log(`\n[${startTime}] 🔔 ${label} — Starting notice scrape...`);

    execFile('node', [SCRAPER_PATH], { cwd: path.dirname(SCRAPER_PATH) }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);

      if (err) {
        console.error(`[${new Date().toISOString()}] ❌ Scraper exited with code ${err.code}: ${err.message}`);
      } else {
        console.log(`[${new Date().toISOString()}] ✅ ${label} scrape finished.`);
      }
      resolve();
    });
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' RGPVMate — Notice Scheduler (Phase 4.5)');
  console.log(`   Cron schedule : ${CRON_SCHEDULE}  (UTC)`);
  console.log(`   Scraper path  : ${SCRAPER_PATH}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`❌ Invalid cron expression: "${CRON_SCHEDULE}"`);
    process.exit(1);
  }

  // Optionally run immediately on startup
  if (RUN_NOW) {
    await runScraper('Startup (--run-now)');
  }

  // Schedule recurring job
  const job = cron.schedule(CRON_SCHEDULE, () => {
    runScraper('Scheduled').catch(err => {
      console.error('Scheduler caught error:', err.message);
    });
  });

  console.log(`⏰ Scheduler active. Next run at cron: ${CRON_SCHEDULE} (UTC)`);
  console.log('   Press Ctrl+C to stop.\n');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT received. Stopping scheduler...');
    job.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received. Stopping scheduler...');
    job.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('💥 Scheduler startup error:', err.message);
  process.exit(1);
});
