#!/usr/bin/env node
// Applies db/schema.sql to the Supabase Postgres database named by DATABASE_URL.
// Idempotent: safe to run repeatedly. Run with:  npm run db:init
//
// Self-contained (its own pg pool) so it works regardless of the app's DB module.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\n✗ DATABASE_URL is not set. Add it to your .env file first.');
    console.error('  (Supabase → Project Settings → Database → Session pooler connection string)\n');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('→ Connecting to Supabase…');
    await pool.query('SELECT 1');
    console.log('✓ Connected.');

    console.log('→ Applying db/schema.sql…');
    await pool.query(sql);
    console.log('✓ Schema applied.');

    // Report what now exists, so the result is visible without opening the dashboard.
    const { rows: tables } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    const { rows: [{ count: settingsCount }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM settings`
    );

    console.log(`\n✓ Tables in 'public' (${tables.length}): ${tables.map(t => t.table_name).join(', ')}`);
    console.log(`✓ Seeded settings rows: ${settingsCount}\n`);
    console.log('Done. The Supabase database is ready.');
  } catch (err) {
    console.error('\n✗ Failed to apply schema:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
