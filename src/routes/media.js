// Adverse media management routes.
//
// GET  /api/media/sources           — fetcher health cards for the dashboard
// POST /api/media/sources/:src/sync — test-fetch for a source (logs result)

const express  = require('express');
const { getDb } = require('../db/database');
const { listFetchers, getFetcher, fetchAll } = require('../services/media/fetchers/registry');

const router = express.Router();

// ── GET /api/media/sources ────────────────────────────────────────────────────
// Merges the static fetcher registry with the last sync_log entry per source.
router.get('/sources', (req, res) => {
  const db       = getDb();
  const fetchers = listFetchers();

  const sources = fetchers.map(f => {
    const last = db.prepare(`
      SELECT * FROM adverse_media_sync_log
      WHERE source = ? ORDER BY synced_at DESC LIMIT 1
    `).get(f.name);

    return {
      name:          f.name,
      label:         f.label,
      lastUsed:      last?.synced_at       || null,
      lastStatus:    last?.status          || 'never',
      lastCount:     last?.records_count   || 0,
      error:         last?.error_message   || null,
    };
  });

  res.json(sources);
});

// ── POST /api/media/sources/:src/sync ─────────────────────────────────────────
// Runs a lightweight test fetch ("test" as the name) and logs the result.
// Used by the dashboard's per-source "Test" button.
router.post('/sources/:src/sync', express.json(), async (req, res) => {
  const db  = getDb();
  const src = req.params.src;
  const fetchers = listFetchers();
  if (!fetchers.find(f => f.name === src)) {
    return res.status(404).json({ error: `Unknown source: ${src}` });
  }

  const fetcher  = getFetcher(src);
  const testName = req.body?.testName || 'compliance screening test';
  try {
    // Call only the specific fetcher — not fetchAll — so one source's
    // rate-limit doesn't pollute another source's test result.
    const articles = await fetcher.fetch(testName, { lookbackDays: 30, max: 10 });

    db.prepare(`
      INSERT INTO adverse_media_sync_log (source, status, records_count, error_message)
      VALUES (?, 'success', ?, NULL)
    `).run(src, articles.length);

    res.json({ source: src, status: 'success', count: articles.length, error: null });
  } catch (err) {
    db.prepare(`
      INSERT INTO adverse_media_sync_log (source, status, records_count, error_message)
      VALUES (?, 'error', 0, ?)
    `).run(src, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
