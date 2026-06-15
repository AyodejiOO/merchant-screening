const xml2js = require('xml2js');

async function parseUN(xmlData) {
  const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });
  const result = await parser.parseStringPromise(xmlData);

  const entries = [];
  const root = result.CONSOLIDATED_LIST || result;

  // Individuals
  for (const ind of (root.INDIVIDUALS?.[0]?.INDIVIDUAL ?? [])) {
    try {
      const parts = [
        ind.FIRST_NAME?.[0],
        ind.SECOND_NAME?.[0],
        ind.THIRD_NAME?.[0],
        ind.FOURTH_NAME?.[0],
      ].filter(Boolean);
      const name = parts.join(' ').trim();
      if (!name) continue;

      const aliases = [];
      for (const a of (ind.ALIAS ?? [])) {
        const an = a.ALIAS_NAME?.[0] || '';
        if (an && an !== name) aliases.push(an);
      }

      entries.push({
        list_source:     'UN',
        entity_type:     'individual',
        name,
        aliases:         JSON.stringify(aliases),
        country:         ind.NATIONALITY?.[0]?.VALUE?.[0] || '',
        program:         ind.UN_LIST_TYPE?.[0] || '',
        raw_id:          ind.DATAID?.[0] || '',
        additional_info: JSON.stringify({ title: ind.TITLE?.[0] || '' }),
      });
    } catch (_) { /* skip */ }
  }

  // Entities
  for (const entity of (root.ENTITIES?.[0]?.ENTITY ?? [])) {
    try {
      const name = entity.FIRST_NAME?.[0] || '';
      if (!name) continue;

      const aliases = [];
      for (const a of (entity.ENTITY_ALIAS ?? [])) {
        const an = a.ALIAS_NAME?.[0] || '';
        if (an && an !== name) aliases.push(an);
      }

      entries.push({
        list_source:     'UN',
        entity_type:     'entity',
        name,
        aliases:         JSON.stringify(aliases),
        country:         '',
        program:         entity.UN_LIST_TYPE?.[0] || '',
        raw_id:          entity.DATAID?.[0] || '',
        additional_info: JSON.stringify({}),
      });
    } catch (_) { /* skip */ }
  }

  return entries;
}

module.exports = { parseUN };
