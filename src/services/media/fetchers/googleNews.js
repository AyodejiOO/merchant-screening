// Google News RSS fetcher.
//
// Uses the public Google News RSS search endpoint. Unofficial — may break
// without notice; we degrade gracefully (caller catches and marks source unhealthy).
//
// Per name we run one request augmented with a focused risk-keyword query.
// This trades breadth for signal: a plain name search returns too much benign news,
// while name + adverse keywords narrows to articles likely to matter for compliance.

const axios  = require('axios');
const xml2js = require('xml2js');

const ENDPOINT = 'https://news.google.com/rss/search';

// Augmenting keywords that make the search compliance-relevant.
// Kept deliberately small — exhaustive lists return zero results due to query length limits.
const RISK_TERMS = [
  'fraud', 'money laundering', 'corruption', 'sanctions',
  'bribery', 'investigation', 'lawsuit', 'indictment',
];

function buildQuery(name) {
  const cleanedName = name.replace(/"/g, '').trim();
  // OR the risk terms; quote the name to keep it as a single phrase.
  return `"${cleanedName}" (${RISK_TERMS.join(' OR ')})`;
}

// Google News publisher info comes wrapped in `<source>NAME</source>` tags;
// titles often suffix with " - Publisher Name". We split it out for cleaner UI.
function splitTitle(titleAttr) {
  const m = /^(.+?)\s+-\s+([^-]+)$/.exec(titleAttr || '');
  if (m) return { title: m[1].trim(), publisher: m[2].trim() };
  return { title: (titleAttr || '').trim(), publisher: '' };
}

function buildSnippet(description) {
  if (!description) return '';
  // Description is HTML wrapped — strip tags, collapse whitespace, truncate.
  return description
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

async function fetchGoogleNews(name, opts = {}) {
  const lookbackDays = opts.lookbackDays || 365;
  const max = opts.max || 50;

  const params = new URLSearchParams({
    q:   `${buildQuery(name)} when:${lookbackDays}d`,
    hl:  'en-US',
    gl:  'US',
    ceid: 'US:en',
  });

  const resp = await axios.get(`${ENDPOINT}?${params.toString()}`, {
    timeout: 15_000,
    headers: { 'User-Agent': 'SanctionScreener/1.0 (internal compliance tool)' },
    responseType: 'text',
  });

  const parsed = await new xml2js.Parser({ explicitArray: false, trim: true })
    .parseStringPromise(resp.data);

  const items = parsed?.rss?.channel?.item;
  if (!items) return [];
  const itemArr = Array.isArray(items) ? items : [items];

  const articles = itemArr.slice(0, max).map(item => {
    const { title, publisher } = splitTitle(item.title);
    return {
      url:         item.link || '',
      title,
      snippet:     buildSnippet(item.description),
      source:      publisher || (item.source?._ || item.source || 'Unknown'),
      publishedAt: item.pubDate || null,
      fetcher:     'google_news',
    };
  });

  // Filter out anything missing a URL or title
  return articles.filter(a => a.url && a.title);
}

module.exports = {
  name: 'google_news',
  label: 'Google News',
  fetch: fetchGoogleNews,
};
