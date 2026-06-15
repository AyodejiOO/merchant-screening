// Fetcher registry. Multiplex configured fetchers; dedupe by URL.
//
// Each fetcher exposes: { name, label, fetch(name, opts) → Article[] }
// Article shape: { url, title, snippet, source, publishedAt, fetcher }
//
// To add a new source (GDELT, paid API, etc.) drop a file in ./ and register it here.
// To enable/disable, toggle a setting key (future). For phase 1 all registered fetchers run.

const googleNews = require('./googleNews');
const gdelt      = require('./gdelt');

const FETCHERS = [googleNews, gdelt];

function listFetchers() {
  return FETCHERS.map(f => ({ name: f.name, label: f.label }));
}

function getFetcher(name) {
  return FETCHERS.find(f => f.name === name) || null;
}

// Fetch from all enabled fetchers in parallel. A single fetcher failure must not
// kill the whole search — we collect per-source errors and surface them in the
// result so the dashboard can show the source as degraded.
async function fetchAll(name, opts = {}) {
  const results = await Promise.allSettled(
    FETCHERS.map(f => f.fetch(name, opts).then(arts => ({ fetcher: f.name, articles: arts })))
  );

  const articles = [];
  const errors = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      articles.push(...r.value.articles);
    } else {
      errors.push({ fetcher: FETCHERS[i].name, message: r.reason?.message || String(r.reason) });
    }
  }

  return { articles: dedupeByUrl(articles), errors };
}

function dedupeByUrl(articles) {
  const seen = new Set();
  const out = [];
  for (const a of articles) {
    if (!a.url || seen.has(a.url)) continue;
    seen.add(a.url);
    out.push(a);
  }
  return out;
}

module.exports = { listFetchers, getFetcher, fetchAll };
