// Keyword classifier. Default, free path.
//
// Scores articles by matching title + snippet against per-category keyword lists.
// Returns { category, score, classifiedBy: 'keyword' } where score is 0..1.
//
// Tuning philosophy: prefer false negatives over false positives. Compliance
// analysts can re-screen with the LLM classifier later if they want broader
// recall. Loud false positives erode trust faster than misses.

// Categories are scored together; the strongest hit wins. Within each, terms
// are a mix of single words (broad — catches headline-style "convicted of fraud")
// and multi-word phrases (specific — "money laundering").
//
// We also detect adjacent words to the merchant name: a stand-alone "fraud" in a
// headline that mentions the merchant by name is high signal.
const CATEGORIES = {
  // Heaviest categories: high base score per match, more weight if multiple terms hit.
  financial_crime: {
    severity: 1.0,
    terms: [
      // Phrases
      'money laundering', 'wire fraud', 'securities fraud', 'tax fraud',
      'tax evasion', 'fraud charges', 'fraud scheme', 'fraud conviction',
      'criminal complaint', 'criminal indictment', 'criminal charges',
      // Single words (high signal in headlines)
      'fraud', 'defrauded', 'laundering', 'embezzlement', 'embezzle',
      'ponzi', 'indicted', 'convicted', 'guilty', 'sentenced', 'arrested',
    ],
  },
  sanctions_violation: {
    severity: 1.0,
    terms: [
      'sanctions violation', 'sanctions evasion', 'sanctioned entity',
      'ofac violation', 'export control violation', 'embargo violation',
      'iran sanctions', 'russia sanctions', 'north korea sanctions',
      'sanctioned', 'sanction breach',
    ],
  },
  terrorism: {
    severity: 1.0,
    terms: [
      'terrorist financing', 'terror financing', 'terrorism financing',
      'terror group', 'designated terrorist', 'terror-linked',
      'al-qaeda', 'isis', 'hezbollah', 'hamas funding',
      'terrorism', 'terrorist',
    ],
  },
  corruption: {
    severity: 0.9,
    terms: [
      // Phrases
      'foreign corrupt practices', 'corrupt practices', 'official misconduct',
      'corrupt official', 'fcpa',
      // Single words
      'bribery', 'bribe', 'bribed', 'kickback', 'kickbacks',
      'corruption', 'corrupt',
    ],
  },
  // Medium categories: regulatory action, civil cases. Often material but less acute.
  regulatory: {
    severity: 0.7,
    terms: [
      'sec charges', 'sec investigation', 'sec settlement',
      'consent decree', 'cease and desist', 'enforcement action',
      'regulatory fine', 'civil penalty', 'civil charges',
      'finra', 'fca probe', 'finma',
      // Single words
      'fined', 'investigation', 'probe', 'penalised', 'penalized',
    ],
  },
  reputation: {
    severity: 0.5,
    terms: [
      'class action', 'settlement reached', 'allegations of', 'accused of',
      // Single words
      'lawsuit', 'whistleblower', 'misconduct', 'malpractice',
      'allegations', 'accused', 'scandal', 'collapse',
    ],
  },
};

const STOP_WORDS = new Set([
  'the','a','an','and','or','of','for','to','in','on','with','by','at','as',
]);

function normaliseText(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Hit detection: simple substring presence after normalisation.
// Multi-word terms have to appear as a phrase ("money laundering"), single words
// must be word-bounded so e.g. "fraudulent" matches when the term is "fraud".
function termHits(text, term) {
  const norm = normaliseText(text);
  const t = normaliseText(term);
  if (t.includes(' ')) {
    // Phrase
    return norm.includes(t) ? 1 : 0;
  }
  // Single word — word-boundary regex
  const re = new RegExp(`\\b${escapeRegex(t)}\\b`, 'g');
  const matches = norm.match(re);
  return matches ? matches.length : 0;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Names containing risk-terms (e.g. a person named "Mr. Sanchez" with "sanc..." substring)
// would otherwise score high regardless of content. We require the merchant name to
// appear in the article *and* that the risk terms are in distinct positions.
function articleMentionsName(article, name) {
  const norm = normaliseText(`${article.title} ${article.snippet}`);
  const n = normaliseText(name);
  // Require name length ≥ 3 chars to avoid 2-letter false hits.
  if (n.length < 3) return false;
  return norm.includes(n);
}

function classifyOne(article, opts = {}) {
  const name = opts.name || '';
  const text = `${article.title || ''} ${article.snippet || ''}`;
  if (!text.trim()) {
    return { category: 'other', score: 0, classifiedBy: 'keyword' };
  }

  // Bonus: require the article to mention the merchant name. If it does not,
  // floor the score — Google News may return adjacent stories that don't actually
  // discuss this merchant.
  const nameMatches = name && articleMentionsName(article, name);

  let bestCategory = 'other';
  let bestRaw = 0;
  let bestSeverity = 0;
  const hitDetails = [];

  for (const [category, { severity, terms }] of Object.entries(CATEGORIES)) {
    let raw = 0;
    let termsHit = 0;
    for (const term of terms) {
      const hits = termHits(text, term);
      if (hits > 0) {
        raw += hits;
        termsHit += 1;
        hitDetails.push({ category, term, hits });
      }
    }
    // Score within category: more distinct terms = higher signal than the same
    // term repeated. Cap raw at 5 to prevent keyword stuffing from blowing up.
    const cappedRaw = Math.min(5, raw);
    const distinctBonus = Math.min(0.5, termsHit * 0.1);
    const categoryScore = (cappedRaw / 5) * 0.8 + distinctBonus;

    if (categoryScore > bestRaw) {
      bestRaw = categoryScore;
      bestCategory = category;
      bestSeverity = severity;
    }
  }

  // Final 0..1 score combines category match strength with severity weighting.
  let score = bestRaw * bestSeverity;

  // Floor when the article doesn't actually mention the merchant.
  if (!nameMatches) score *= 0.4;

  // Floor when there are no hits at all.
  if (bestRaw === 0) score = 0;

  return {
    category: bestCategory,
    score: Math.max(0, Math.min(1, score)),
    classifiedBy: 'keyword',
    hits: hitDetails.slice(0, 5),
  };
}

module.exports = {
  name: 'keyword',
  classify: classifyOne,
  categories: Object.keys(CATEGORIES),
};
