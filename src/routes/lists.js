const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { syncList, syncAllLists, getListStatus, LIST_CONFIGS, updateListUrl, importListFile, checkForUpdates } = require('../services/listSync');
const { buildIndex }      = require('../services/screening');
const { all, run, invalidateSettings } = require('../db/database');
const { updateSchedules } = require('../services/scheduler');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/lists');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 200 * 1024 * 1024 } });

const router = express.Router();

router.get('/status', async (_, res) => {
  try {
    res.json(await getListStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/check-updates', async (_, res) => {
  try {
    const results = await checkForUpdates();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync/:source', async (req, res) => {
  try {
    const count = await syncList(req.params.source.toUpperCase());
    await buildIndex();
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-all', async (_, res) => {
  try {
    const results = await syncAllLists();
    await buildIndex();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings', async (_, res) => {
  try {
    const rows = await all(`SELECT * FROM settings`);
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await run(`UPDATE settings SET value = $1, updated_at = now() WHERE key = $2`, [String(value), key]);
    }
    await invalidateSettings();   // refresh the in-memory cache before re-scheduling
    updateSchedules();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/urls/:source', (req, res) => {
  try {
    updateListUrl(req.params.source.toUpperCase(), req.body.url);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/configs', (_, res) => {
  res.json(
    Object.fromEntries(
      Object.entries(LIST_CONFIGS).map(([k, v]) => [k, {
        label:              v.label,
        url:                v.url,
        filename:           v.filename,
        manualDownloadPage: v.manualDownloadPage || null,
        requiresManualImport: !v.url,
      }])
    )
  );
});

// Manual file import for lists that don't have a public auto-download URL
router.post('/import/:source', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  const source = req.params.source.toUpperCase();
  try {
    const count = await importListFile(source, req.file.path);
    await buildIndex();
    res.json({ success: true, count, message: `${source} imported: ${count} entries` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sync-history', async (_, res) => {
  try {
    res.json(await all(`SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT 200`));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
