const cron    = require('node-cron');
const fs      = require('fs');
const { getDb }         = require('../db/database');
const { syncAllLists }  = require('./listSync');
const { buildIndex, runBatchJob } = require('./screening');

let syncTask  = null;
let batchTask = null;

function getSetting(db, key, fallback) {
  return db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key)?.value ?? fallback;
}

function initScheduler() {
  const db              = getDb();
  const syncSchedule    = getSetting(db, 'sync_schedule',      '0 2 * * 0');
  const batchSchedule   = getSetting(db, 'batch_schedule',     '0 3 1 * *');
  const autoBatchEnabled = getSetting(db, 'auto_batch_enabled', 'false') === 'true';

  if (cron.validate(syncSchedule)) {
    syncTask = cron.schedule(syncSchedule, async () => {
      console.log('[Scheduler] Running scheduled list sync…');
      try {
        const results = await syncAllLists();
        buildIndex();
        console.log('[Scheduler] Sync complete:', JSON.stringify(results));
      } catch (err) {
        console.error('[Scheduler] Sync error:', err.message);
      }
    });
    console.log(`[Scheduler] List sync: ${syncSchedule}`);
  }

  if (autoBatchEnabled && cron.validate(batchSchedule)) {
    batchTask = cron.schedule(batchSchedule, async () => {
      console.log('[Scheduler] Running monthly batch re-screen…');
      try {
        await runScheduledBatch();
      } catch (err) {
        console.error('[Scheduler] Batch error:', err.message);
      }
    });
    console.log(`[Scheduler] Auto batch: ${batchSchedule}`);
  }
}

async function runScheduledBatch() {
  const db = getDb();

  const lastJob = db.prepare(`
    SELECT * FROM screening_jobs
    WHERE status = 'completed' AND file_path IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `).get();

  if (!lastJob) {
    console.log('[Scheduler] No previous batch job to re-run');
    return;
  }
  if (!fs.existsSync(lastJob.file_path)) {
    console.log('[Scheduler] Batch source file missing:', lastJob.file_path);
    return;
  }

  const { parse } = require('csv-parse/sync');
  const content   = fs.readFileSync(lastJob.file_path, 'utf-8');
  const records   = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });

  if (!records.length) return;

  const columns    = Object.keys(records[0]);
  const nameColumn = columns.find(k =>
    ['name', 'company', 'business', 'merchant', 'entity', 'company name', 'business name', 'company_name']
      .includes(k.toLowerCase())
  ) || columns[0];

  const names = records
    .map((r, i) => ({ name: (r[nameColumn] || '').trim(), rowNumber: i + 1 }))
    .filter(n => n.name);

  const jobName = `Auto Re-screen — ${new Date().toISOString().slice(0, 10)}`;
  const { lastInsertRowid: jobId } = db.prepare(`
    INSERT INTO screening_jobs (job_name, job_type, status, threshold, file_path)
    VALUES (?, 'scheduled', 'pending', ?, ?)
  `).run(jobName, lastJob.threshold, lastJob.file_path);

  const result = await runBatchJob(jobId, names, lastJob.threshold);
  console.log(`[Scheduler] Auto batch complete: ${result.processed} records, ${result.matchCount} matches`);
}

function updateSchedules() {
  if (syncTask)  { syncTask.stop();  syncTask  = null; }
  if (batchTask) { batchTask.stop(); batchTask = null; }
  initScheduler();
}

module.exports = { initScheduler, updateSchedules, runScheduledBatch };
