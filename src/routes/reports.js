const express  = require('express');
const { stringify } = require('csv-stringify/sync');
const path     = require('path');
const fs       = require('fs');
const { get, all } = require('../db/database');

const router      = express.Router();
const REPORTS_DIR = path.join(__dirname, '../../reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// Export full job results as CSV
router.get('/jobs/:id/export', async (req, res) => {
  try {
    const job = await get(`SELECT * FROM screening_jobs WHERE id = $1`, [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { status } = req.query;
    const filtered = status && status !== 'all';

    const rows = filtered
      ? await all(`SELECT * FROM screening_results WHERE job_id = $1 AND status = $2 ORDER BY row_number`, [req.params.id, status])
      : await all(`SELECT * FROM screening_results WHERE job_id = $1 ORDER BY row_number`, [req.params.id]);

    const csvData = rows.map(r => {
      const matches = JSON.parse(r.matches || '[]');
      const top     = matches[0] || {};
      return {
        'Row #':                    r.row_number,
        'Input Name':               r.input_name,
        'Status':                   r.status,
        'Top Match Score (%)':      r.top_match_score,
        'Top Matched Name':         r.top_match_name   || '',
        'Top Match List Source':    r.top_match_source || '',
        'Top Match Country':        top.country        || '',
        'Top Match Program':        top.program        || '',
        'Top Match Entity Type':    top.entityType     || '',
        'Total Matches Found':      matches.length,
        'All Sources Matched':      matches.map(m => m.listSource).join(' | '),
        'All Matched Names':        matches.map(m => m.matchedName).join(' | '),
        'All Scores':               matches.map(m => `${m.matchScore}%`).join(' | '),
        'Screened At':              r.screened_at,
      };
    });

    const csv      = stringify(csvData, { header: true });
    const filename = `sanctions_report_job${job.id}_${Date.now()}.csv`;
    fs.writeFileSync(path.join(REPORTS_DIR, filename), csv);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary stats for a job
router.get('/jobs/:id/summary', async (req, res) => {
  try {
    const job = await get(`SELECT * FROM screening_jobs WHERE id = $1`, [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const byStatus = await all(`
      SELECT status, COUNT(*)::int as count FROM screening_results WHERE job_id = $1 GROUP BY status
    `, [req.params.id]);

    const bySource = await all(`
      SELECT top_match_source as source, COUNT(*)::int as count
      FROM screening_results
      WHERE job_id = $1 AND top_match_source IS NOT NULL AND top_match_source != ''
      GROUP BY top_match_source ORDER BY count DESC
    `, [req.params.id]);

    const byScore = await all(`
      SELECT
        CASE
          WHEN top_match_score >= 85 THEN 'High (85–100%)'
          WHEN top_match_score >= 70 THEN 'Medium (70–84%)'
          WHEN top_match_score >= 50 THEN 'Low (50–69%)'
          ELSE 'No Match'
        END as range,
        COUNT(*)::int as count
      FROM screening_results WHERE job_id = $1
      GROUP BY range ORDER BY count DESC
    `, [req.params.id]);

    res.json({ job, byStatus, bySource, byScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
