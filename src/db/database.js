// Database layer — Postgres (Supabase) via node-postgres.
//
// Replaces the previous synchronous better-sqlite3 module. Every query is now
// async. Call sites use: await get/all/run/query(sql, params) and withTransaction.
// Schema lives in db/schema.sql (applied via `npm run db:init`), not here.

require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL is not set — the app cannot reach the database. Add it to .env.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase requires TLS; local dev relaxes cert check
  max: 10,
});

// Surface unexpected pool errors instead of crashing silently.
pool.on('error', (err) => console.error('[DB] Unexpected pool error:', err.message));

// ── Query helpers (mirror the old better-sqlite3 verbs) ──────────────────────
async function query(sql, params = []) { return pool.query(sql, params); }
async function all(sql, params = [])   { return (await pool.query(sql, params)).rows; }
async function get(sql, params = [])   { return (await pool.query(sql, params)).rows[0] ?? null; }
async function run(sql, params = [])   { const r = await pool.query(sql, params); return { rowCount: r.rowCount, rows: r.rows }; }

// Transaction helper: the callback receives a dedicated client; it must use
// client.query(...) for every statement so they share one BEGIN/COMMIT.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── In-memory settings cache ─────────────────────────────────────────────────
// The settings table is tiny (~12 rows) and read very frequently (4x per name
// screened). Cache it in memory so the screening hot path stays synchronous and
// doesn't fire thousands of network round-trips on a large batch.
let settingsCache = null;

async function loadSettings() {
  const rows = await all(`SELECT key, value FROM settings`);
  settingsCache = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return settingsCache;
}

function getSetting(key, fallback) {
  return settingsCache?.[key] ?? fallback;
}

// Call after any settings write so the cache reflects the new values.
async function invalidateSettings() {
  return loadSettings();
}

module.exports = {
  pool, query, get, all, run, withTransaction,
  loadSettings, getSetting, invalidateSettings,
};
