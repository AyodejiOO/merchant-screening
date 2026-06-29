-- Postgres schema for Merchant Sanction Screening (Supabase)
-- Translated from the original SQLite schema in src/db/database.js.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / ON CONFLICT).
--
-- Translation notes:
--   SQLite INTEGER PRIMARY KEY AUTOINCREMENT  ->  BIGINT GENERATED ALWAYS AS IDENTITY
--   SQLite DATETIME DEFAULT CURRENT_TIMESTAMP ->  TIMESTAMPTZ DEFAULT now()
--   SQLite REAL                               ->  DOUBLE PRECISION
--   JSON-bearing columns stay TEXT (app does JSON.parse/stringify). JSONB is a future option.

-- 1. Sanction list entries (re-populated from official sources via "Sync all lists")
CREATE TABLE IF NOT EXISTS sanctions_entries (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_source     TEXT NOT NULL,
  entity_type     TEXT NOT NULL DEFAULT 'unknown',
  name            TEXT NOT NULL,
  aliases         TEXT DEFAULT '[]',
  country         TEXT,
  program         TEXT,
  additional_info TEXT DEFAULT '{}',
  raw_id          TEXT,
  last_synced_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sanctions_source ON sanctions_entries(list_source);
CREATE INDEX IF NOT EXISTS idx_sanctions_name   ON sanctions_entries(name);

-- 2. Sanction list sync history
CREATE TABLE IF NOT EXISTS sync_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_source   TEXT NOT NULL,
  status        TEXT NOT NULL,
  records_count INTEGER DEFAULT 0,
  error_message TEXT,
  synced_at     TIMESTAMPTZ DEFAULT now()
);

-- 3. Screening jobs (checks_run + lookback_days folded in from later ALTERs)
CREATE TABLE IF NOT EXISTS screening_jobs (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name          TEXT NOT NULL,
  job_type          TEXT NOT NULL DEFAULT 'manual',
  status            TEXT NOT NULL DEFAULT 'pending',
  total_records     INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  match_count       INTEGER DEFAULT 0,
  file_path         TEXT,
  report_path       TEXT,
  threshold         DOUBLE PRECISION DEFAULT 0.6,
  checks_run        TEXT DEFAULT 'sanctions',
  lookback_days     INTEGER DEFAULT 365,
  created_at        TIMESTAMPTZ DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

-- 4. Adverse media: per-job per-merchant findings
CREATE TABLE IF NOT EXISTS adverse_media_results (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id               BIGINT NOT NULL REFERENCES screening_jobs(id) ON DELETE CASCADE,
  input_name           TEXT NOT NULL,
  row_number           INTEGER,
  status               TEXT NOT NULL DEFAULT 'clear',
  finding_count        INTEGER DEFAULT 0,
  top_finding_score    DOUBLE PRECISION DEFAULT 0,
  top_finding_category TEXT,
  top_finding_source   TEXT,
  findings             TEXT DEFAULT '[]',
  screened_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_results_job    ON adverse_media_results(job_id);
CREATE INDEX IF NOT EXISTS idx_media_results_status ON adverse_media_results(status);

-- 5. Adverse media: fetcher source health
CREATE TABLE IF NOT EXISTS adverse_media_sync_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source        TEXT NOT NULL,
  status        TEXT NOT NULL,
  records_count INTEGER DEFAULT 0,
  error_message TEXT,
  synced_at     TIMESTAMPTZ DEFAULT now()
);

-- 6. Sanctions screening results
CREATE TABLE IF NOT EXISTS screening_results (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id           BIGINT NOT NULL REFERENCES screening_jobs(id) ON DELETE CASCADE,
  input_name       TEXT NOT NULL,
  row_number       INTEGER,
  status           TEXT NOT NULL DEFAULT 'clear',
  top_match_score  DOUBLE PRECISION DEFAULT 0,
  top_match_name   TEXT,
  top_match_source TEXT,
  matches          TEXT DEFAULT '[]',
  screened_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_results_job    ON screening_results(job_id);
CREATE INDEX IF NOT EXISTS idx_results_status ON screening_results(status);

-- 7. Key/value settings
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default settings (no-op if a key already exists)
INSERT INTO settings (key, value) VALUES
  ('fuzzy_threshold',             '0.6'),
  ('max_matches',                 '10'),
  ('sync_schedule',               '0 2 * * 0'),
  ('batch_schedule',              '0 3 1 * *'),
  ('auto_batch_enabled',          'false'),
  ('match_status_high',           '0.85'),
  ('match_status_medium',         '0.70'),
  ('media_default_lookback_days', '365'),
  ('media_classifier_mode',       'keyword'),
  ('media_status_high',           '0.70'),
  ('media_status_medium',         '0.40'),
  ('media_min_finding_score',     '0.30')
ON CONFLICT (key) DO NOTHING;
