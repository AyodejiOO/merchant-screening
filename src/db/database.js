const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/sanctions.db');

let db;

function getDb() {
  if (!db) {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sanctions_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      list_source TEXT    NOT NULL,
      entity_type TEXT    NOT NULL DEFAULT 'unknown',
      name        TEXT    NOT NULL,
      aliases     TEXT    DEFAULT '[]',
      country     TEXT,
      program     TEXT,
      additional_info TEXT DEFAULT '{}',
      raw_id      TEXT,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sanctions_source ON sanctions_entries(list_source);
    CREATE INDEX IF NOT EXISTS idx_sanctions_name   ON sanctions_entries(name);

    CREATE TABLE IF NOT EXISTS sync_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      list_source   TEXT NOT NULL,
      status        TEXT NOT NULL,
      records_count INTEGER DEFAULT 0,
      error_message TEXT,
      synced_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS screening_jobs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name          TEXT NOT NULL,
      job_type          TEXT NOT NULL DEFAULT 'manual',
      status            TEXT NOT NULL DEFAULT 'pending',
      total_records     INTEGER DEFAULT 0,
      processed_records INTEGER DEFAULT 0,
      match_count       INTEGER DEFAULT 0,
      file_path         TEXT,
      report_path       TEXT,
      threshold         REAL DEFAULT 0.6,
      checks_run        TEXT DEFAULT 'sanctions',
      lookback_days     INTEGER DEFAULT 365,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at      DATETIME
    );

    -- Adverse media: per-job per-merchant findings
    CREATE TABLE IF NOT EXISTS adverse_media_results (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id                INTEGER NOT NULL,
      input_name            TEXT NOT NULL,
      row_number            INTEGER,
      status                TEXT NOT NULL DEFAULT 'clear',
      finding_count         INTEGER DEFAULT 0,
      top_finding_score     REAL DEFAULT 0,
      top_finding_category  TEXT,
      top_finding_source    TEXT,
      findings              TEXT DEFAULT '[]',
      screened_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES screening_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_results_job    ON adverse_media_results(job_id);
    CREATE INDEX IF NOT EXISTS idx_media_results_status ON adverse_media_results(status);

    -- Adverse media: fetcher source health
    CREATE TABLE IF NOT EXISTS adverse_media_sync_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source        TEXT NOT NULL,
      status        TEXT NOT NULL,
      records_count INTEGER DEFAULT 0,
      error_message TEXT,
      synced_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS screening_results (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id           INTEGER NOT NULL,
      input_name       TEXT NOT NULL,
      row_number       INTEGER,
      status           TEXT NOT NULL DEFAULT 'clear',
      top_match_score  REAL DEFAULT 0,
      top_match_name   TEXT,
      top_match_source TEXT,
      matches          TEXT DEFAULT '[]',
      screened_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES screening_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_results_job    ON screening_results(job_id);
    CREATE INDEX IF NOT EXISTS idx_results_status ON screening_results(status);

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Idempotent column adds for existing DBs (ALTER ADD is no-op-safe via try/catch)
  // SQLite has no IF NOT EXISTS for ALTER TABLE ADD COLUMN; we swallow the duplicate-column error.
  const safeAddColumn = (table, def) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); }
    catch (err) {
      if (!/duplicate column name/i.test(err.message)) throw err;
    }
  };
  safeAddColumn('screening_jobs', `checks_run TEXT DEFAULT 'sanctions'`);
  safeAddColumn('screening_jobs', `lookback_days INTEGER DEFAULT 365`);

  const defaults = [
    ['fuzzy_threshold',      '0.6'],
    ['max_matches',          '10'],
    ['sync_schedule',        '0 2 * * 0'],
    ['batch_schedule',       '0 3 1 * *'],
    ['auto_batch_enabled',   'false'],
    ['match_status_high',    '0.85'],
    ['match_status_medium',  '0.70'],
    // Adverse media defaults
    ['media_default_lookback_days', '365'],
    ['media_classifier_mode',       'keyword'],
    ['media_status_high',           '0.70'],
    ['media_status_medium',         '0.40'],
    ['media_min_finding_score',     '0.30'],
  ];
  const ins = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of defaults) ins.run(k, v);
}

module.exports = { getDb };
