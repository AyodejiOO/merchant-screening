const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { parse } = require('csv-parse/sync');
const { get, all, run }                        = require('../db/database');
const { screenName, runBatchJob, buildIndex }  = require('../services/screening');

const router      = express.Router();
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename:    (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ── CSV template download ───────────────────────────────────────────────────
router.get('/template', (_req, res) => {
  const csv = [
    'name,country,notes',
    'Acme Trading Ltd,US,Example merchant — replace with your data',
    'Globex Industries,DE,',
    'Initech Holdings,GB,',
  ].join('\n') + '\n';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="screening-template.csv"');
  res.send(csv);
});

// ── Single lookup ────────────────────────────────────────────────────────────
router.post('/single', (req, res) => {
  const { name, threshold } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const result = screenName(name.trim(), {
    threshold: threshold != null ? parseFloat(threshold) / 100 : undefined,
  });
  res.json(result);
});

// Helper: detect the most likely name column from a parsed CSV record list.
function detectNameColumn(records, override) {
  if (!records.length) return null;
  const cols = Object.keys(records[0]);
  if (override && cols.includes(override)) return override;
  return cols.find(k =>
    ['name','company','business','merchant','entity','company name','business name','company_name']
      .includes(k.toLowerCase())
  ) || cols[0];
}

// ── Step 1: Upload CSV (validate format, count rows, persist file) ──────────
// Returns { uploadId, filename, rowCount, detectedColumn }. The uploadId is the
// stored filename — the second-step /batch endpoint references the file by it.
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });

  try {
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const records = parse(content, {
      columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true,
    });

    if (!records.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'CSV has no data rows.' });
    }

    const detectedColumn = detectNameColumn(records, req.body.nameColumn);
    const validRows = records.filter(r => (r[detectedColumn] || '').trim()).length;

    if (validRows === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: `No valid names found in column "${detectedColumn}". Check your CSV format or column names.`,
      });
    }

    return res.json({
      uploadId: req.file.filename,             // multer-generated unique name in /uploads
      filename: req.file.originalname,
      rowCount: validRows,
      detectedColumn,
      sizeBytes: req.file.size,
    });
  } catch (err) {
    // Cleanup on parse failure so we don't leak temp files
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: `Could not parse CSV: ${err.message}` });
  }
});

// ── Step 2: Start batch screening on a previously uploaded file ─────────────
// Accepts JSON body with { uploadId, jobName?, threshold?, nameColumn? }.
router.post('/batch', express.json(), async (req, res) => {
  const { uploadId, nameColumn = null } = req.body || {};
  if (!uploadId) return res.status(400).json({ error: 'uploadId is required (run /upload first).' });

  const filePath = path.join(UPLOADS_DIR, path.basename(uploadId));   // basename guards against path traversal
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Uploaded file not found. Re-upload and try again.' });
  }

  const threshold = req.body.threshold != null ? parseFloat(req.body.threshold) / 100 : 0.6;
  const jobName   = req.body.jobName || `Batch — ${new Date().toLocaleString()}`;

  let jobId;
  try {
    const { rows } = await run(`
      INSERT INTO screening_jobs (job_name, job_type, status, threshold, file_path)
      VALUES ($1, 'batch', 'pending', $2, $3)
      RETURNING id
    `, [jobName, threshold, filePath]);
    jobId = rows[0].id;
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ jobId, status: 'pending', message: 'Batch screening started' });

  // Process asynchronously after responding
  setImmediate(async () => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const records = parse(content, {
        columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true,
      });

      if (!records.length) {
        await run(`UPDATE screening_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
        return;
      }

      const col = detectNameColumn(records, nameColumn);
      const names = records
        .map((r, i) => ({ name: (r[col] || '').trim(), rowNumber: i + 1 }))
        .filter(n => n.name);

      await runBatchJob(jobId, names, threshold);
    } catch (err) {
      await run(`UPDATE screening_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
      console.error('[Batch] Job failed:', err.message);
    }
  });
});

// ── Jobs ─────────────────────────────────────────────────────────────────────
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await all(`SELECT * FROM screening_jobs ORDER BY created_at DESC LIMIT 100`);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lightweight endpoint for the global progress indicator.
// Returns running jobs + jobs that completed/failed in the recent past.
router.get('/jobs/active', async (_req, res) => {
  try {
    const running = await all(`
      SELECT id, job_name, status, total_records, processed_records, match_count, created_at
      FROM screening_jobs
      WHERE status = 'running'
      ORDER BY created_at DESC
    `);

    // Show "completed" state briefly (5s) so the analyst notices the transition.
    // Show "failed" state longer (60s) — failures need more attention.
    const recentlyCompleted = await all(`
      SELECT id, job_name, status, total_records, processed_records, match_count, completed_at
      FROM screening_jobs
      WHERE (status = 'completed' AND completed_at > now() - interval '5 seconds')
         OR (status = 'failed'    AND completed_at > now() - interval '60 seconds')
      ORDER BY completed_at DESC
    `);

    res.json({ running, recentlyCompleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await get(`SELECT * FROM screening_jobs WHERE id = $1`, [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/:id/results', async (req, res) => {
  try {
    const { page = 1, limit = 200, status } = req.query;
    const offset    = (parseInt(page) - 1) * parseInt(limit);
    const filtered  = status && status !== 'all';

    const rows = filtered
      ? await all(`SELECT * FROM screening_results WHERE job_id = $1 AND status = $2 ORDER BY row_number LIMIT $3 OFFSET $4`,
          [req.params.id, status, parseInt(limit), offset])
      : await all(`SELECT * FROM screening_results WHERE job_id = $1 ORDER BY row_number LIMIT $2 OFFSET $3`,
          [req.params.id, parseInt(limit), offset]);

    const totalRow = filtered
      ? await get(`SELECT COUNT(*)::int as n FROM screening_results WHERE job_id = $1 AND status = $2`, [req.params.id, status])
      : await get(`SELECT COUNT(*)::int as n FROM screening_results WHERE job_id = $1`, [req.params.id]);

    res.json({
      results: rows.map(r => ({ ...r, matches: JSON.parse(r.matches || '[]') })),
      total:   totalRow.n,
      page:    parseInt(page),
      limit:   parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rebuild index ─────────────────────────────────────────────────────────────
router.post('/rebuild-index', async (_, res) => {
  try {
    const count = await buildIndex();
    res.json({ message: 'Index rebuilt', itemCount: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
