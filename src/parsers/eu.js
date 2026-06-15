const xml2js = require('xml2js');

// EU Consolidated Sanctions XML (webgate.ec.europa.eu FSF)
// Structure: <export> → <sanctionEntity> (flat, no entity/individual sub-elements)
// Names are in nameAlias[].$ attributes; entity type is in subjectType[].$.classificationCode
async function parseEU(xmlData) {
  const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });
  const result = await parser.parseStringPromise(xmlData);

  const entries = [];
  const root    = result.export || result;
  const sanctionEntities = root.sanctionEntity || [];

  for (const se of sanctionEntities) {
    try {
      const attrs = se.$ || {};
      const logicalId = attrs.logicalId || '';

      // Entity type from subjectType classificationCode: P=person, E=entity, V=vessel, A=aircraft
      const subjectCode = se.subjectType?.[0]?.$.classificationCode?.toLowerCase() || 'e';
      const entityType  = subjectCode === 'p' ? 'individual' : 'entity';

      // Programs from regulation[].$.programme
      const programs = [];
      for (const reg of (se.regulation ?? [])) {
        const prog = reg.$.programme;
        if (prog) programs.push(prog);
      }

      // Names from nameAlias[].$ — strong:"true" = primary/strong name
      let primaryName = '';
      const aliases   = [];

      for (const alias of (se.nameAlias ?? [])) {
        const a      = alias.$ || {};
        const whole  = a.wholeName || '';
        const fn     = a.firstName  || '';
        const ln     = a.lastName   || '';
        const name   = whole || (fn ? `${fn} ${ln}`.trim() : ln);
        if (!name) continue;

        const isStrong = a.strong === 'true';
        if (isStrong && !primaryName) {
          primaryName = name;
        } else if (name !== primaryName) {
          aliases.push(name);
        }
      }

      // Fall back to first alias if no strong name found
      if (!primaryName && aliases.length) {
        primaryName = aliases.shift();
      }
      if (!primaryName) continue;

      // Citizenship/country
      let country = '';
      for (const cit of (se.citizenship ?? [])) {
        const countryDesc = cit.countryDescription?.[0] || cit.$?.countryDescription || '';
        if (countryDesc) { country = countryDesc; break; }
      }

      entries.push({
        list_source:     'EU',
        entity_type:     entityType,
        name:            primaryName,
        aliases:         JSON.stringify([...new Set(aliases)].filter(a => a !== primaryName)),
        country,
        program:         programs.join(', '),
        raw_id:          logicalId,
        additional_info: JSON.stringify({ programs, subjectCode }),
      });
    } catch (_) { /* skip malformed entries */ }
  }

  return entries;
}

module.exports = { parseEU };
