// GDELT 2.0 DOC API fetcher (free, no API key required).
//
// Uses the GDELT Document API which searches the full text of news articles
// indexed by GDELT. Returns structured article metadata including detected
// themes (V2THEMES) which map well to compliance categories.
//
// Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
// Rate: free, no auth, ~reasonable limits for compliance use cases.

const axios = require('axios');

const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

// GDELT V2THEMES that map to compliance risk categories.
// Used to enrich article metadata; the keyword classifier still scores the text.
const COMPLIANCE_THEMES = [
  'ECON_TAXEVASION', 'ECON_MONEYLAUNDERING', 'ECON_EMBEZZLEMENT',
  'CRIME_FINANCIAL', 'CRIME_FRAUD', 'CRIME_CORRUPTION',
  'WB_696_ANTICORRUPTION', 'WB_697_ANTI_CORRUPTION_INSTITUTIONS',
  'TERROR', 'TERROR_FINANCIALSUPPORT',
  'SANCTIONS',
  'TAX_FNCACT', 'ARREST', 'INDICTMENT',
];

// Build a risk-focused GDELT query for the merchant name.
// GDELT supports proximity and boolean operators.
function buildQuery(name) {
  const clean = name.replace(/"/g, '').trim();
  // Require the name and at least one risk-adjacent term.
  // NEAR/5 is too strict for short names; use OR of key risk terms.
  return `"${clean}" (fraud OR corruption OR "money laundering" OR sanctions OR indicted OR arrested OR bribery)`;
}

function parseGdeltArticle(item, name) {
  return {
    url:         item.url || '',
    title:       (item.title || '').trim(),
    snippet:     (item.seendescription || item.socialimage || '').trim().slice(0, 280),
    source:      item.domain || item.sourcecountry || 'Unknown',
    publishedAt: item.seendate ? formatGdeltDate(item.seendate) : null,
    fetcher:     'gdelt',
    // Bonus metadata from GDELT that the classifier can leverage
    gdeltThemes: (item.themes || '').split(';').filter(t =>
      COMPLIANCE_THEMES.some(ct => t.includes(ct))
    ),
  };
}

// GDELT dates come as "YYYYMMDDHHMMSS" — convert to ISO
function formatGdeltDate(raw) {
  if (!raw || raw.length < 8) return null;
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return `${y}-${m}-${d}T00:00:00Z`;
}

async function fetchGdelt(name, opts = {}) {
  const lookbackDays = opts.lookbackDays || 365;
  const max = Math.min(opts.max || 50, 250); // GDELT caps at 250

  const params = new URLSearchParams({
    query:      buildQuery(name),
    mode:       'artlist',
    maxrecords: max,
    timespan:   `${lookbackDays}d`,
    format:     'json',
    sort:       'DateDesc',
  });

  const resp = await axios.get(`${ENDPOINT}?${params.toString()}`, {
    timeout: 20_000,
    headers: { 'User-Agent': 'SanctionScreener/1.0 (internal compliance tool)' },
  });

  const items = resp.data?.articles || [];
  return items
    .map(item => parseGdeltArticle(item, name))
    .filter(a => a.url && a.title);
}

module.exports = {
  name:  'gdelt',
  label: 'GDELT',
  fetch: fetchGdelt,
};
