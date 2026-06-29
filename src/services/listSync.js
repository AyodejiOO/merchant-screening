const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const { get, run, withTransaction } = require('../db/database');
const { parseOFAC }     = require('../parsers/ofac');
const { parseEU }       = require('../parsers/eu');
const { parseUN }       = require('../parsers/un');
const { parseUK }       = require('../parsers/uk');
const { parseAustralia} = require('../parsers/australia');
const { parseCanada }   = require('../parsers/canada');

const LISTS_DIR = path.join(__dirname, '../../data/lists');

// Official free-to-use source URLs (update here if they change)
const LIST_CONFIGS = {
  OFAC: {
    url:      'https://www.treasury.gov/ofac/downloads/sdn.xml',
    format:   'xml',
    parser:   parseOFAC,
    filename: 'ofac_sdn.xml',
    label:    'OFAC SDN List',
  },
  UN: {
    url:      'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
    format:   'xml',
    parser:   parseUN,
    filename: 'un_consolidated.xml',
    label:    'UN SC Consolidated List',
  },
  UK: {
    url:      'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml',
    format:   'xml',
    parser:   parseUK,
    filename: 'uk_sanctions.xml',
    label:    'UK Sanctions List (FCDO)',
    manualDownloadPage: 'https://www.gov.uk/government/publications/the-uk-sanctions-list',
  },
  AUSTRALIA: {
    url:      'https://www.dfat.gov.au/sites/default/files/Australian_Sanctions_Consolidated_List.xlsx',
    format:   'xlsx',
    parser:   parseAustralia,
    filename: 'australia_dfat.xlsx',
    label:    'Australia DFAT Consolidated List',
    manualDownloadPage: 'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list',
  },
  CANADA: {
    url:      'https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xml',
    format:   'xml',
    parser:   parseCanada,
    filename: 'canada_sema.xml',
    label:    'Canada SEMA Sanctions List',
    manualDownloadPage: 'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx?lang=eng',
  },
  EU: {
    url:      'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',
    format:   'xml',
    parser:   parseEU,
    filename: 'eu_sanctions.xml',
    label:    'EU Consolidated Sanctions',
    manualDownloadPage: 'https://eeas.europa.eu/topics/sanctions-eu-restrictive-measures/8442_en',
  },
};

async function downloadRaw(config) {
  const isBinary  = config.format === 'xlsx';
  const resp = await axios.get(config.url, {
    timeout:          180_000,   // 3 min — Canada server is slow
    maxContentLength: 200 * 1024 * 1024,
    responseType:     isBinary ? 'arraybuffer' : 'text',
    headers: { 'User-Agent': 'SanctionScreener/1.0 (internal compliance tool)' },
  });
  return isBinary ? Buffer.from(resp.data) : resp.data;
}

// Atomic replace of one list's entries: DELETE then re-INSERT in batches, all in
// one transaction so a list is never left empty if something fails midway.
// Batched multi-row INSERT (~1000 rows/statement) keeps round-trips low over the
// network — a row-at-a-time loop would be unbearably slow against a remote DB.
async function replaceEntries(listSource, entries) {
  const COLS = 8;
  const BATCH = 1000;
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM sanctions_entries WHERE list_source = $1`, [listSource]);
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      const values = [];
      const tuples = slice.map((e, r) => {
        const b = r * COLS;
        values.push(
          e.list_source, e.entity_type ?? 'unknown', e.name,
          e.aliases ?? '[]', e.country ?? null, e.program ?? null,
          e.additional_info ?? '{}', e.raw_id ?? null,
        );
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`;
      });
      await client.query(
        `INSERT INTO sanctions_entries
          (list_source, entity_type, name, aliases, country, program, additional_info, raw_id)
         VALUES ${tuples.join(',')}`,
        values
      );
    }
  });
}

async function syncList(listSource) {
  const config = LIST_CONFIGS[listSource];
  if (!config) throw new Error(`Unknown list source: ${listSource}`);

  // Lists with no auto-download URL require manual import
  if (!config.url) {
    const cachedPath = path.join(LISTS_DIR, config.filename);
    if (!fs.existsSync(cachedPath)) {
      const msg = `No auto-download URL configured. Please use Manual Import in Settings. Download from: ${config.manualDownloadPage || 'official source'}`;
      await run(`INSERT INTO sync_log (list_source, status, error_message) VALUES ($1, 'manual_required', $2)`, [listSource, msg]);
      throw new Error(msg);
    }
    // Use cached/manually-imported file
    console.log(`[Sync] ${listSource} — using manually imported file`);
  }

  console.log(`[Sync] ${listSource} — starting`);
  if (!fs.existsSync(LISTS_DIR)) fs.mkdirSync(LISTS_DIR, { recursive: true });

  let rawData;
  const cachedPath = path.join(LISTS_DIR, config.filename);

  if (config.url) {
    const isBinary = config.format === 'xlsx';
    try {
      rawData = await downloadRaw(config);
      isBinary
        ? fs.writeFileSync(cachedPath, rawData)
        : fs.writeFileSync(cachedPath, rawData, 'utf-8');
      console.log(`[Sync] ${listSource} — downloaded`);
    } catch (err) {
      console.warn(`[Sync] ${listSource} — download failed (${err.message}), trying cache`);
      if (fs.existsSync(cachedPath)) {
        rawData = isBinary ? fs.readFileSync(cachedPath) : fs.readFileSync(cachedPath, 'utf-8');
        console.log(`[Sync] ${listSource} — using cached file`);
      } else {
        const msg = `Download failed and no cache: ${err.message}`;
        await run(`INSERT INTO sync_log (list_source, status, error_message) VALUES ($1, 'failed', $2)`, [listSource, msg]);
        throw new Error(msg);
      }
    }
  } else {
    const isBinary = config.format === 'xlsx';
    rawData = isBinary ? fs.readFileSync(cachedPath) : fs.readFileSync(cachedPath, 'utf-8');
  }

  let entries;
  try {
    entries = config.format === 'xml'
      ? await config.parser(rawData)
      : config.parser(rawData);
    console.log(`[Sync] ${listSource} — parsed ${entries.length} entries`);
  } catch (err) {
    const msg = `Parse failed: ${err.message}`;
    await run(`INSERT INTO sync_log (list_source, status, error_message) VALUES ($1, 'failed', $2)`, [listSource, msg]);
    throw new Error(msg);
  }

  // Atomic replace
  await replaceEntries(listSource, entries);

  await run(`INSERT INTO sync_log (list_source, status, records_count) VALUES ($1, 'success', $2)`, [listSource, entries.length]);
  console.log(`[Sync] ${listSource} — complete (${entries.length} entries)`);
  return entries.length;
}

async function syncAllLists() {
  const results = {};
  for (const src of Object.keys(LIST_CONFIGS)) {
    try {
      results[src] = { status: 'success', count: await syncList(src) };
    } catch (err) {
      results[src] = { status: 'failed', error: err.message };
    }
  }
  return results;
}

async function getListStatus() {
  const out = {};
  for (const [src, cfg] of Object.entries(LIST_CONFIGS)) {
    const lastSync = await get(`SELECT * FROM sync_log WHERE list_source = $1 ORDER BY synced_at DESC LIMIT 1`, [src]);
    const count    = await get(`SELECT COUNT(*)::int as n FROM sanctions_entries WHERE list_source = $1`, [src]);
    out[src] = {
      label:       cfg.label,
      lastSync:    lastSync?.synced_at  || null,
      lastStatus:  lastSync?.status     || 'never',
      recordCount: count?.n             || 0,
      error:       lastSync?.error_message || null,
    };
  }
  return out;
}

// Check if remote list is newer than our last sync (uses HTTP HEAD — no full download)
async function checkForUpdates() {
  const results = {};

  for (const [src, cfg] of Object.entries(LIST_CONFIGS)) {
    if (!cfg.url) {
      results[src] = { status: 'manual', message: 'Manual import required' };
      continue;
    }
    try {
      const resp = await axios.head(cfg.url, {
        timeout: 15_000,
        headers: { 'User-Agent': 'SanctionScreener/1.0' },
      });
      const remoteModified = resp.headers['last-modified']
        ? new Date(resp.headers['last-modified'])
        : null;

      const lastSync = await get(
        `SELECT synced_at FROM sync_log WHERE list_source = $1 AND status = 'success' ORDER BY synced_at DESC LIMIT 1`,
        [src]
      );
      const lastSyncDate = lastSync ? new Date(lastSync.synced_at) : null;

      const updateAvailable = remoteModified && lastSyncDate
        ? remoteModified > lastSyncDate
        : !lastSyncDate;  // never synced = always needs update

      results[src] = {
        status:          'ok',
        remoteModified:  remoteModified?.toISOString() || null,
        lastSync:        lastSyncDate?.toISOString()   || null,
        updateAvailable,
        message:         updateAvailable
          ? remoteModified ? `Update available (remote: ${remoteModified.toDateString()})` : 'Sync recommended'
          : `Up to date (last synced: ${lastSyncDate?.toDateString()})`,
      };
    } catch (err) {
      results[src] = { status: 'error', message: err.message };
    }
  }

  return results;
}

function updateListUrl(listSource, newUrl) {
  if (!LIST_CONFIGS[listSource]) throw new Error(`Unknown source: ${listSource}`);
  LIST_CONFIGS[listSource].url = newUrl;
}

// Manual import: user uploads a file they downloaded from the official source
async function importListFile(listSource, filePath) {
  const config = LIST_CONFIGS[listSource];
  if (!config) throw new Error(`Unknown list source: ${listSource}`);

  if (!fs.existsSync(LISTS_DIR)) fs.mkdirSync(LISTS_DIR, { recursive: true });

  const rawData = fs.readFileSync(filePath, 'utf-8');

  let entries;
  try {
    entries = config.format === 'xml'
      ? await config.parser(rawData)
      : config.parser(rawData);
  } catch (err) {
    const msg = `Parse failed: ${err.message}`;
    await run(`INSERT INTO sync_log (list_source, status, error_message) VALUES ($1, 'failed', $2)`, [listSource, msg]);
    throw new Error(msg);
  }

  if (!entries.length) throw new Error('No entries parsed from the uploaded file. Check the file format.');

  // Cache the imported file for future use
  const cachedPath = path.join(LISTS_DIR, config.filename);
  fs.copyFileSync(filePath, cachedPath);

  await replaceEntries(listSource, entries);

  await run(`INSERT INTO sync_log (list_source, status, records_count) VALUES ($1, 'success', $2)`, [listSource, entries.length]);
  console.log(`[Import] ${listSource} — imported ${entries.length} entries from ${filePath}`);
  return entries.length;
}

module.exports = { syncList, syncAllLists, getListStatus, LIST_CONFIGS, updateListUrl, importListFile, checkForUpdates };
