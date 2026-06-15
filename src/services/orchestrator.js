// Unified screening orchestrator.
//
// Single entry point that fans out across the requested check types (sanctions,
// adverse media) and returns a unified shape. Callers (routes, batch jobs) just
// say "screen this name with these checks" and don't have to know about each
// engine's internals.
//
// Result shape:
//   {
//     name,
//     checks,
//     sanctions?:   { matches: [...], topMatchScore, status },     // when 'sanctions' in checks
//     adverseMedia?: { findings: [...], status, topFindingScore },  // when 'media' in checks
//   }

const { screenName } = require('./screening');
const { searchAdverseMedia } = require('./media');

const VALID_CHECKS = new Set(['sanctions', 'media']);

function normaliseChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    // Default to sanctions only — preserves prior behaviour if a caller forgets to pass checks.
    return ['sanctions'];
  }
  return checks.filter(c => VALID_CHECKS.has(c));
}

async function screenUnified(name, opts = {}) {
  const checks       = normaliseChecks(opts.checks);
  const threshold    = opts.threshold;
  const lookbackDays = opts.lookbackDays;

  // Run checks in parallel — they're independent
  const promises = [];
  if (checks.includes('sanctions')) {
    promises.push(
      Promise.resolve().then(() => screenName(name, { threshold }))
        .then(res => ['sanctions', res])
        .catch(err => ['sanctions', { error: err.message, matches: [], topMatchScore: 0, status: 'clear' }])
    );
  }
  if (checks.includes('media')) {
    promises.push(
      searchAdverseMedia(name, { lookbackDays })
        .then(res => ['media', res])
        .catch(err => ['media', { error: err.message, findings: [], topFindingScore: 0, status: 'clear', sourcesUsed: [] }])
    );
  }

  const results = await Promise.all(promises);

  const out = { name, checks };
  for (const [key, value] of results) {
    if (key === 'sanctions') out.sanctions    = value;
    if (key === 'media')     out.adverseMedia = value;
  }
  return out;
}

module.exports = { screenUnified, normaliseChecks };
