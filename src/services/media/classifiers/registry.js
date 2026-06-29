// Classifier registry. Picks the active classifier based on settings + env.
//
// - Default: keyword (free, fast, deterministic)
// - When ANTHROPIC_API_KEY env var is set AND settings.media_classifier_mode = 'llm',
//   the LLM classifier is used.
//
// Consumer call site (in media/index.js):
//     const classify = require('./classifiers/registry').get();
//     const { category, score } = await classify(article, { name });

const keyword = require('./keyword');
const llm     = require('./llm');
const { getSetting } = require('../../../db/database');

function get() {
  const mode = getSetting('media_classifier_mode', 'keyword');
  if (mode === 'llm' && llm.isAvailable()) return llm.classify;
  return keyword.classify;
}

function describe() {
  const mode = getSetting('media_classifier_mode', 'keyword');
  return {
    active:    mode === 'llm' && llm.isAvailable() ? 'llm' : 'keyword',
    requested: mode,
    llmAvailable: llm.isAvailable(),
  };
}

module.exports = { get, describe };
