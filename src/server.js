require('dotenv').config();
const express = require('express');
const path    = require('path');
const { pool, get, all, loadSettings } = require('./db/database');
const { buildIndex }   = require('./services/screening');
const { initScheduler }= require('./services/scheduler');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/screening', require('./routes/screening'));
app.use('/api/screen',    require('./routes/screen'));      // new unified path
app.use('/api/media',     require('./routes/media'));       // adverse media management
app.use('/api/lists',     require('./routes/lists'));
app.use('/api/reports',   require('./routes/reports'));

app.get('/api/health', async (_, res) => {
  try {
    const total = await get(`SELECT COUNT(*)::int as n FROM sanctions_entries`);
    const bySrc = await all(`SELECT list_source, COUNT(*)::int as n FROM sanctions_entries GROUP BY list_source`);
    res.json({ status: 'ok', totalEntries: total.n, bySource: bySrc, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// SPA fallback
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
  // Fail fast with a clear message if the connection string is wrong/missing.
  await pool.query('SELECT 1');
  console.log('[Server] Connected to Postgres (Supabase)');

  await loadSettings();
  console.log('[Server] Settings loaded');

  await buildIndex();

  initScheduler();

  app.listen(PORT, () => {
    console.log(`\n  Merchant Sanction Screening Tool`);
    console.log(`  http://localhost:${PORT}\n`);
  });
}

start().catch(err => { console.error('[Server] Fatal:', err); process.exit(1); });
