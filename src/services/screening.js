const Fuse   = require('fuse.js');
const { getDb } = require('../db/database');

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

function getSetting(db, key, fallback) {
  return db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key)?.value ?? fallback;
}

function buildIndex() {
  const db      = getDb();
  const entries = db.prepare(`SELECT * FROM sanctions_entries`).all();

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

function screenName(inputName, options = {}) {
  if (!fuseIndex) buildIndex();

  const db            = getDb();
  const threshold     = options.threshold     ?? parseFloat(getSetting(db, 'fuzzy_threshold', '0.6'));
  const maxMatches    = options.maxMatches    ?? parseInt(getSetting(db, 'max_matches', '10'));
  const highThresh    = parseFloat(getSetting(db, 'match_status_high',   '0.85'));
  const mediumThresh  = parseFloat(getSetting(db, 'match_status_medium', '0.70'));

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
  const db = getDb();
  if (!fuseIndex) buildIndex();

  db.prepare(`UPDATE screening_jobs SET status = 'running', total_records = ? WHERE id = ?`).run(names.length, jobId);

  const insertResult = db.prepare(`
    INSERT INTO screening_results
      (job_id, input_name, row_number, status, top_match_score, top_match_name, top_match_source, matches)
    VALUES
      (@job_id, @input_name, @row_number, @status, @top_match_score, @top_match_name, @top_match_source, @matches)
  `);

  let processed  = 0;
  let matchCount = 0;
  const CHUNK    = 200;

  for (let i = 0; i < names.length; i += CHUNK) {
    const chunk = names.slice(i, i + CHUNK);

    db.transaction(() => {
      for (const { name, rowNumber } of chunk) {
        const r = screenName(name, { threshold });
        insertResult.run({
          job_id:           jobId,
          input_name:       name,
          row_number:       rowNumber,
          status:           r.status,
          top_match_score:  r.topMatchScore,
          top_match_name:   r.topMatchName,
          top_match_source: r.topMatchSource,
          matches:          JSON.stringify(r.matches),
        });
        if (r.status !== 'clear') matchCount++;
        processed++;
      }
    })();

    db.prepare(`UPDATE screening_jobs SET processed_records = ?, match_count = ? WHERE id = ?`)
      .run(processed, matchCount, jobId);
  }

  db.prepare(`
    UPDATE screening_jobs
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP, processed_records = ?, match_count = ?
    WHERE id = ?
  `).run(processed, matchCount, jobId);

  return { processed, matchCount };
}

// Runs adverse media screening for all names in a batch job.
// Called after runBatchJob (sanctions) if checks includes 'media'.
// Processes in small async chunks to avoid hammering the News API.
async function runBatchMediaJob(jobId, names, opts = {}) {
  const db          = getDb();
  const { searchAdverseMedia } = require('./media');
  const lookbackDays = opts.lookbackDays || 365;

  const insertMedia = db.prepare(`
    INSERT INTO adverse_media_results
      (job_id, input_name, row_number, status, finding_count,
       top_finding_score, top_finding_category, top_finding_source, findings)
    VALUES
      (@job_id, @input_name, @row_number, @status, @finding_count,
       @top_finding_score, @top_finding_category, @top_finding_source, @findings)
  `);

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

    db.transaction(() => {
      for (const settled of results) {
        if (settled.status === 'rejected') continue;
        const { name, rowNumber, result: r } = settled.value;
        const top = r.findings?.[0];
        if (r.status !== 'clear') mediaMatchCount++;
        insertMedia.run({
          job_id:               jobId,
          input_name:           name,
          row_number:           rowNumber,
          status:               r.status,
          finding_count:        r.findings?.length || 0,
          top_finding_score:    r.topFindingScore  || 0,
          top_finding_category: r.topFindingCategory || null,
          top_finding_source:   top?.source || null,
          findings:             JSON.stringify(r.findings || []),
        });
      }
    })();
  }

  return { mediaMatchCount };
}

module.exports = { buildIndex, screenName, runBatchJob, runBatchMediaJob };
