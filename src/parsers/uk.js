const xml2js = require('xml2js');

// UK Sanctions List (FCDO) — new format since Jan 2026
// XML root: <Designations> → <Designation>
// Replaces the old OFSI ConList.xml format
async function parseUK(xmlData) {
  const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });
  const result = await parser.parseStringPromise(xmlData);

  const entries = [];
  const designations = result.Designations?.Designation ?? [];

  for (const d of designations) {
    try {
      const nameNodes = d.Names?.[0]?.Name ?? [];

      let primaryName = '';
      const aliases   = [];

      for (const n of nameNodes) {
        const nameStr = n.Name6?.[0] || '';
        const nameType = n.NameType?.[0] || '';
        if (!nameStr) continue;
        if (nameType === 'Primary Name' || !primaryName) {
          if (!primaryName) {
            primaryName = nameStr;
          } else {
            aliases.push(nameStr);
          }
        } else {
          aliases.push(nameStr);
        }
      }

      if (!primaryName) continue;

      const entityTypeRaw = d.IndividualEntityShip?.[0] || d.GroupType?.[0] || '';
      const entityType    = entityTypeRaw.toLowerCase().includes('individual') ? 'individual' : 'entity';

      const regime  = d.RegimeName?.[0] || '';
      const country = d.Nationality?.[0] || d.NationalityCountry?.[0] || '';
      const uid     = d.UniqueID?.[0]    || d.OFSIGroupID?.[0] || '';

      entries.push({
        list_source:     'UK',
        entity_type:     entityType,
        name:            primaryName,
        aliases:         JSON.stringify([...new Set(aliases)].filter(a => a !== primaryName)),
        country,
        program:         regime,
        raw_id:          uid,
        additional_info: JSON.stringify({ regime, entityTypeRaw }),
      });
    } catch (_) { /* skip */ }
  }

  return entries;
}

module.exports = { parseUK };
