// Unified screening routes.
// Old /api/screening/* routes stay (in screening.js) for backward compatibility
// during the phased rollout. New code calls /api/screen/* and gets the unified shape.

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { parse } = require('csv-parse/sync');
const { screenUnified, normaliseChecks } = require('../services/orchestrator');
const { runBatchJob, runBatchMediaJob }  = require('../services/screening');
const { getDb } = require('../db/database');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const router = express.Router();

// ── POST /api/screen/single ───────────────────────────────────────────────────
//   body: { name, checks?: ['sanctions','media'], threshold?, lookbackDays? }
router.post('/single', express.json(), async (req, res) => {
  const { name, threshold, lookbackDays } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const checks = normaliseChecks(req.body?.checks);
  if (checks.length === 0) {
    return res.status(400).json({ error: 'At least one check type required (sanctions, media)' });
  }

  try {
    const result = await screenUnified(name.trim(), {
      checks,
      threshold:    threshold != null ? parseFloat(threshold) / 100 : undefined,
      lookbackDays: lookbackDays != null ? parseInt(lookbackDays, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('[screen/single] failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/screen/batch ────────────────────────────────────────────────────
//   body: { uploadId, jobName?, threshold?, checks?, lookbackDays? }
//   Accepts the same uploadId from /api/screening/upload. Runs whichever checks
//   are requested. Media runs after sanctions to keep progress tracking simple.
router.post('/batch', express.json(), (req, res) => {
  const { uploadId, nameColumn = null } = req.body || {};
  if (!uploadId) return res.status(400).json({ error: 'uploadId is required (run /upload first).' });

  const filePath = path.join(UPLOADS_DIR, path.basename(uploadId));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Uploaded file not found. Re-upload and try again.' });
  }

  const db          = getDb();
  const threshold   = req.body.threshold != null ? parseFloat(req.body.threshold) / 100 : 0.6;
  const lookbackDays = req.body.lookbackDays != null ? parseInt(req.body.lookbackDays, 10) : 365;
  const checks      = normaliseChecks(req.body.checks);
  const checksStr   = checks.join(',');
  const jobName     = req.body.jobName || `Batch — ${new Date().toLocaleString()}`;

  const { lastInsertRowid: jobId } = db.prepare(`
    INSERT INTO screening_jobs (job_name, job_type, status, threshold, file_path, checks_run, lookback_days)
    VALUES (?, 'batch', 'pending', ?, ?, ?, ?)
  `).run(jobName, threshold, filePath, checksStr, lookbackDays);

  res.json({ jobId, status: 'pending', checks, message: 'Batch screening started' });

  // Process asynchronously
  setImmediate(async () => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const records = parse(content, {
        columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true,
      });
      if (!records.length) {
        db.prepare(`UPDATE screening_jobs SET status = 'failed' WHERE id = ?`).run(jobId);
        return;
      }

      const cols = Object.keys(records[0]);
      const col  = nameColumn || cols.find(k =>
        ['name','company','business','merchant','entity','company name','business name','company_name']
          .includes(k.toLowerCase())
      ) || cols[0];

      const names = records
        .map((r, i) => ({ name: (r[col] || '').trim(), rowNumber: i + 1 }))
        .filter(n => n.name);

      // Phase A: sanctions (synchronous, fast)
      if (checks.includes('sanctions')) {
        await runBatchJob(jobId, names, threshold);
      } else {
        // Even if sanctions is skipped, mark total_records + set status to running
        db.prepare(`UPDATE screening_jobs SET status = 'running', total_records = ? WHERE id = ?`).run(names.length, jobId);
      }

      // Phase B: adverse media (async, slower — one network call per name)
      if (checks.includes('media')) {
        await runBatchMediaJob(jobId, names, { lookbackDays });
      }

      // Mark complete only if sanctions didn't already do it
      if (!checks.includes('sanctions')) {
        db.prepare(`
          UPDATE screening_jobs
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP, processed_records = ?
          WHERE id = ?
        `).run(names.length, jobId);
      }

    } catch (err) {
      db.prepare(`UPDATE screening_jobs SET status = 'failed' WHERE id = ?`).run(jobId);
      console.error('[screen/batch] Job failed:', err.message);
    }
  });
});

// ── GET /api/screen/jobs/:id/media-results ────────────────────────────────────
//   Returns adverse_media_results for a job. Mirrors /api/screening/jobs/:id/results
router.get('/jobs/:id/media-results', (req, res) => {
  const db = getDb();
  const { page = 1, limit = 200, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const where  = status && status !== 'all' ? 'AND status = ?' : '';
  const params = status && status !== 'all'
    ? [req.params.id, status, parseInt(limit), offset]
    : [req.params.id, parseInt(limit), offset];

  const rows = db.prepare(
    `SELECT * FROM adverse_media_results WHERE job_id = ? ${where} ORDER BY row_number LIMIT ? OFFSET ?`
  ).all(...params);

  const totalRow = db.prepare(
    `SELECT COUNT(*) as n FROM adverse_media_results WHERE job_id = ? ${where}`
  ).get(...(status && status !== 'all' ? [req.params.id, status] : [req.params.id]));

  res.json({
    results: rows.map(r => ({ ...r, findings: JSON.parse(r.findings || '[]') })),
    total:   totalRow.n,
    page:    parseInt(page),
    limit:   parseInt(limit),
  });
});

// ── GET /api/screen/jobs/:id/media-summary ────────────────────────────────────
router.get('/jobs/:id/media-summary', (req, res) => {
  const db = getDb();
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM adverse_media_results WHERE job_id = ? GROUP BY status
  `).all(req.params.id);

  const byCategory = db.prepare(`
    SELECT top_finding_category as category, COUNT(*) as count
    FROM adverse_media_results
    WHERE job_id = ? AND top_finding_category IS NOT NULL
    GROUP BY top_finding_category ORDER BY count DESC
  `).all(req.params.id);

  res.json({ byStatus, byCategory });
});

module.exports = router;
