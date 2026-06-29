// Adverse media search entry point.
//
// searchAdverseMedia(name, opts) → {
//   findings: [{ url, title, snippet, source, publishedAt, category, score, classifiedBy }, ...],
//   total,
//   status,            // confirmed_adverse | potential_adverse | review | clear
//   topFindingScore,
//   topFindingCategory,
//   sourcesUsed: [{ fetcher, label, articleCount, error? }],
// }

const fetchers     = require('./fetchers/registry');
const classifiers  = require('./classifiers/registry');
const { getSetting } = require('../../db/database');

// Map an aggregate top-score to a status bucket. Mirrors the sanctions taxonomy.
function statusFromScore(score) {
  const high   = parseFloat(getSetting('media_status_high',   '0.70'));
  const medium = parseFloat(getSetting('media_status_medium', '0.40'));
  if (score >= high)   return 'confirmed_adverse';
  if (score >= medium) return 'potential_adverse';
  if (score > 0)       return 'review';
  return 'clear';
}

async function searchAdverseMedia(name, opts = {}) {
  const lookbackDays = opts.lookbackDays || parseInt(getSetting('media_default_lookback_days', '365'), 10);
  const minScore = parseFloat(getSetting('media_min_finding_score', '0.30'));

  // 1. Fetch articles from all configured sources in parallel
  const { articles, errors } = await fetchers.fetchAll(name, { lookbackDays });

  // 2. Classify each article. Run in parallel but cap concurrency so the LLM
  //    classifier (when active) doesn't fan out hundreds of API calls at once.
  const classify = classifiers.get();
  const findings = [];
  const CHUNK = 8;
  for (let i = 0; i < articles.length; i += CHUNK) {
    const slice = articles.slice(i, i + CHUNK);
    const classified = await Promise.all(
      slice.map(async a => {
        try {
          const result = await classify(a, { name });
          return { ...a, ...result };
        } catch (err) {
          // A classifier error shouldn't kill the search — log and skip.
          console.warn(`[media] classify failed for ${a.url}: ${err.message}`);
          return null;
        }
      })
    );
    for (const f of classified) {
      if (f && f.score >= minScore) findings.push(f);
    }
  }

  // 3. Sort highest first, take top N
  findings.sort((a, b) => b.score - a.score);
  const max = parseInt(getSetting('max_matches', '10'), 10);
  const topFindings = findings.slice(0, max);

  // 4. Roll up to a status
  const topScore = topFindings[0]?.score || 0;
  const status   = statusFromScore(topScore);

  // 5. Per-source breakdown for the dashboard / debugging
  const sourceList = fetchers.listFetchers().map(f => {
    const err = errors.find(e => e.fetcher === f.name);
    return {
      fetcher:      f.name,
      label:        f.label,
      articleCount: articles.filter(a => a.fetcher === f.name).length,
      error:        err?.message || null,
    };
  });

  return {
    findings:           topFindings,
    total:              findings.length,
    status,
    topFindingScore:    topScore,
    topFindingCategory: topFindings[0]?.category || null,
    sourcesUsed:        sourceList,
    classifier:         classifiers.describe(),
    lookbackDays,
  };
}

module.exports = { searchAdverseMedia, statusFromScore };
