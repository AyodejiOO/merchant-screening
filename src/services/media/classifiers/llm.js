// LLM classifier — uses Claude via the Anthropic SDK.
//
// Same interface as keyword.classify(article, opts) → { category, score, classifiedBy, reasoning }
//
// Activation: set ANTHROPIC_API_KEY in .env, then set media_classifier_mode='llm' in Settings.
// When ANTHROPIC_API_KEY is absent, isAvailable() returns false and the registry falls back
// to the keyword classifier automatically — no error surfaces to the user.

const KEYWORD_CATEGORIES = require('./keyword').categories;

let _client = null;
function getClient() {
  if (!_client) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// System prompt cached across calls. Claude is instructed to return a strict
// JSON schema so we can parse it reliably without postprocessing.
const SYSTEM_PROMPT = `You are a compliance analyst assistant specialising in adverse media screening.
You receive a news article (title + snippet) and the name of a merchant/entity under review.
Your job is to classify whether the article describes an adverse event involving that entity.

Respond ONLY with a valid JSON object in this exact schema:
{
  "category": "<one of: financial_crime | sanctions_violation | terrorism | corruption | regulatory | reputation | other | not_relevant>",
  "score": <float 0.0 to 1.0>,
  "reasoning": "<one sentence explaining the score>"
}

Scoring guide:
- 0.9–1.0: Article directly reports that the named entity committed a serious act (fraud, laundering, bribery, terror financing, sanctions breach).
- 0.7–0.89: Strong indirect link — entity is under investigation, charged, or named as a party in a serious case.
- 0.4–0.69: Moderate — entity mentioned in regulatory action, civil suit, or reputational controversy.
- 0.2–0.39: Weak — entity mentioned alongside adverse events but not as a principal.
- 0.0–0.19: Entity not materially connected to the adverse event, or the article is not adverse media.
- Use "not_relevant" as category when the article has no meaningful adverse connection.

Be conservative. Prefer false negatives over false positives for low-ambiguity cases.`;

async function classifyOne(article, opts = {}) {
  if (!isAvailable()) {
    throw new Error('LLM classifier requires ANTHROPIC_API_KEY in environment');
  }

  const name    = opts.name || '';
  const text    = [article.title, article.snippet].filter(Boolean).join('\n\n');
  const prompt  = `Merchant under review: "${name}"\n\nArticle:\n${text}`;

  const client = getClient();
  const msg = await client.messages.create({
    model:      'claude-haiku-4-5',    // fast + cheap for classification; upgrade to Sonnet if accuracy matters more
    max_tokens: 256,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = msg.content?.[0]?.text?.trim() || '{}';

  let parsed;
  try {
    // Strip any markdown fences Claude might add defensively
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(clean);
  } catch (_) {
    // If Claude returns something unparseable, treat as not_relevant rather than crashing
    return { category: 'other', score: 0, classifiedBy: 'llm', reasoning: 'Parse error — defaulted to 0' };
  }

  const category = KEYWORD_CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
  const score    = typeof parsed.score === 'number'
    ? Math.max(0, Math.min(1, parsed.score))
    : 0;

  return {
    category,
    score,
    classifiedBy: 'llm',
    reasoning:    parsed.reasoning || '',
  };
}

module.exports = {
  name: 'llm',
  isAvailable,
  classify: classifyOne,
  categories: KEYWORD_CATEGORIES,
};
