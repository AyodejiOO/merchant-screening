require('dotenv').config();
const express = require('express');
const path    = require('path');
const { getDb }        = require('./db/database');
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

app.get('/api/health', (_, res) => {
  const db    = getDb();
  const total = db.prepare(`SELECT COUNT(*) as n FROM sanctions_entries`).get();
  const bySrc = db.prepare(`SELECT list_source, COUNT(*) as n FROM sanctions_entries GROUP BY list_source`).all();
  res.json({ status: 'ok', totalEntries: total.n, bySource: bySrc, timestamp: new Date().toISOString() });
});

// SPA fallback
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
  getDb();
  console.log('[Server] Database ready');

  buildIndex();

  initScheduler();

  app.listen(PORT, () => {
    console.log(`\n  Merchant Sanction Screening Tool`);
    console.log(`  http://localhost:${PORT}\n`);
  });
}

start().catch(err => { console.error('[Server] Fatal:', err); process.exit(1); });
