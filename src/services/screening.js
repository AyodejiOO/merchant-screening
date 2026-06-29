const Fuse   = require('fuse.js');
const { all, run, withTransaction, getSetting } = require('../db/database');

let fuseIndex  = null;
let indexItems = [];

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // strip punctuation
    .replace(/\b(ltd|llc|inc|corp|co|plc|gmbh|sa|bv|nv|pty|ag|srl|spa|sarl|pvt|limited|company|corporation|group|holding|holdings|international|intl|trading|enterprise|enterprises|services)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function buildIndex() {
  const entries = await all(`SELECT * FROM sanctions_entries`);

  indexItems = [];

  for (const entry of entries) {
    let aliases = [];
    try { aliases = JSON.parse(entry.aliases || '[]'); } catch (_) {}

    const base = {
      entryId:    entry.id,
      displayName: entry.name,
      listSource:  entry.list_source,
      entityType:  entry.entity_type,
      country:     entry.country     || '',
      program:     entry.program     || '',
      aliases:     entry.aliases     || '[]',
      additionalInfo: entry.additional_info || '{}',
    };

    indexItems.push({ ...base, searchName: normalizeName(entry.name), matchedAlias: null });

    for (const alias of aliases) {
      if (alias?.trim()) {
        indexItems.push({ ...base, searchName: normalizeName(alias), matchedAlias: alias });
      }
    }
  }

  fuseIndex = new Fuse(indexItems, {
    keys:             ['searchName'],
    threshold:        0.5,   // wide net; caller filters by actual threshold
    includeScore:     true,
    minMatchCharLength: 2,
    ignoreLocation:   true,  // match anywhere, not just at start
    shouldSort:       true,
  });

  console.log(`[Index] Built: ${indexItems.length} searchable items from ${entries.length} entries`);
  return indexItems.length;
}

// Synchronous: reads settings from the in-memory cache (loaded at startup) and
// searches the in-memory Fuse index. No DB/await on the hot path, so large
// batches don't fan out network calls. buildIndex() must have run first.
function screenName(inputName, options = {}) {
  if (!fuseIndex) {
    // Index not built yet (should not happen post-startup). Fail safe to "clear".
    console.warn('[screen] index not built — returning clear');
    return { inputName, status: 'clear', topMatchScore: 0, topMatchName: null, topMatchSource: null, matches: [] };
  }

  const threshold     = options.threshold     ?? parseFloat(getSetting('fuzzy_threshold', '0.6'));
  const maxMatches    = options.maxMatches    ?? parseInt(getSetting('max_matches', '10'));
  const highThresh    = parseFloat(getSetting('match_status_high',   '0.85'));
  const mediumThresh  = parseFloat(getSetting('match_status_medium', '0.70'));

  const normalized  = normalizeName(inputName);
  const rawResults  = fuseIndex.search(normalized, { limit: maxMatches * 8 });

  // Deduplicate: keep best score per entryId
  const bestPerEntry = new Map();
  for (const r of rawResults) {
    const score   = 1 - r.score;          // convert: 1 = perfect, 0 = no match
    const entryId = r.item.entryId;
    if (!bestPerEntry.has(entryId) || bestPerEntry.get(entryId).score < score) {
      bestPerEntry.set(entryId, { score, item: r.item });
    }
  }

  const matches = Array.from(bestPerEntry.values())
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMatches)
    .map(r => {
      const matchStatus = r.score >= highThresh ? 'high' : r.score >= mediumThresh ? 'medium' : 'low';

      let aliases = [];
      let additionalInfo = {};
      try { aliases        = JSON.parse(r.item.aliases        || '[]'); } catch (_) {}
      try { additionalInfo = JSON.parse(r.item.additionalInfo || '{}'); } catch (_) {}

      return {
        matchScore:     Math.round(r.score * 100),
        matchStatus,
        matchedName:    r.item.matchedAlias || r.item.displayName,
        entryName:      r.item.displayName,
        listSource:     r.item.listSource,
        entityType:     r.item.entityType,
        country:        r.item.country,
        program:        r.item.program,
        aliases,
        additionalInfo,
        entryId:        r.item.entryId,
      };
    });

  const top = matches[0] || null;
  const status = !top ? 'clear'
    : top.matchStatus === 'high'   ? 'confirmed_match'
    : top.matchStatus === 'medium' ? 'potential_match'
    : 'review';

  return {
    inputName,
    status,
    topMatchScore:  top?.matchScore  || 0,
    topMatchName:   top?.matchedName || null,
    topMatchSource: top?.listSource  || null,
    matches,
  };
}

async function runBatchJob(jobId, names, threshold) {
  if (!fuseIndex) await buildIndex();

  await run(`UPDATE screening_jobs SET status = 'running', total_records = $1 WHERE id = $2`, [names.length, jobId]);

  const INSERT = `
    INSERT INTO screening_results
      (job_id, input_name, row_number, status, top_match_score, top_match_name, top_match_source, matches)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  let processed  = 0;
  let matchCount = 0;
  const CHUNK    = 200;

  for (let i = 0; i < names.length; i += CHUNK) {
    const chunk = names.slice(i, i + CHUNK);

    await withTransaction(async (client) => {
      for (const { name, rowNumber } of chunk) {
        const r = screenName(name, { threshold });
        await client.query(INSERT, [
          jobId, name, rowNumber, r.status,
          r.topMatchScore, r.topMatchName, r.topMatchSource, JSON.stringify(r.matches),
        ]);
        if (r.status !== 'clear') matchCount++;
        processed++;
      }
    });

    await run(`UPDATE screening_jobs SET processed_records = $1, match_count = $2 WHERE id = $3`,
      [processed, matchCount, jobId]);
  }

  await run(`
    UPDATE screening_jobs
    SET status = 'completed', completed_at = now(), processed_records = $1, match_count = $2
    WHERE id = $3
  `, [processed, matchCount, jobId]);

  return { processed, matchCount };
}

// Runs adverse media screening for all names in a batch job.
// Called after runBatchJob (sanctions) if checks includes 'media'.
// Processes in small async chunks to avoid hammering the News API.
async function runBatchMediaJob(jobId, names, opts = {}) {
  const { searchAdverseMedia } = require('./media');
  const lookbackDays = opts.lookbackDays || 365;

  const INSERT = `
    INSERT INTO adverse_media_results
      (job_id, input_name, row_number, status, finding_count,
       top_finding_score, top_finding_category, top_finding_source, findings)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;

  // Process in parallel chunks. Larger chunks = faster but more concurrent RSS requests.
  // 5 at a time is a safe rate for the free Google News RSS endpoint.
  const CHUNK = 5;
  let mediaMatchCount = 0;

  for (let i = 0; i < names.length; i += CHUNK) {
    const chunk = names.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map(({ name, rowNumber }) =>
        searchAdverseMedia(name, { lookbackDays }).then(r => ({ name, rowNumber, result: r }))
      )
    );

    await withTransaction(async (client) => {
      for (const settled of results) {
        if (settled.status === 'rejected') continue;
        const { name, rowNumber, result: r } = settled.value;
        const top = r.findings?.[0];
        if (r.status !== 'clear') mediaMatchCount++;
        await client.query(INSERT, [
          jobId, name, rowNumber, r.status, r.findings?.length || 0,
          r.topFindingScore || 0, r.topFindingCategory || null, top?.source || null,
          JSON.stringify(r.findings || []),
        ]);
      }
    });
  }

  return { mediaMatchCount };
}

module.exports = { buildIndex, screenName, runBatchJob, runBatchMediaJob };
