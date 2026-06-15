const xml2js = require('xml2js');

// Canada SEMA (Special Economic Measures Act) sanctions XML
// Structure: <data-set> → <record>[]
// Flat format: LastName + GivenName per record; no explicit entity/individual flag
async function parseCanada(xmlData) {
  const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });
  const result = await parser.parseStringPromise(xmlData);

  const entries = [];
  const records = result['data-set']?.record ?? [];

  for (const rec of records) {
    try {
      const last  = rec.LastName?.[0]  || '';
      const first = rec.GivenName?.[0] || '';

      const name = first ? `${first} ${last}`.trim() : last.trim();
      if (!name) continue;

      // No GivenName usually means entity/organisation
      const entityType = first ? 'individual' : 'entity';

      const country  = (rec.Country?.[0] || '').split('/')[0].trim();   // "Belarus / Bélarus" → "Belarus"
      const program  = rec.Schedule?.[0]  || '';
      const rawId    = rec.Item?.[0]       || '';

      entries.push({
        list_source:     'CANADA',
        entity_type:     entityType,
        name,
        aliases:         JSON.stringify([]),
        country,
        program,
        raw_id:          String(rawId),
        additional_info: JSON.stringify({
          schedule:      program,
          dateListed:    rec.DateOfListing?.[0] || '',
          dob:           rec.DateOfBirthOrShipBuildDate?.[0] || '',
        }),
      });
    } catch (_) { /* skip */ }
  }

  return entries;
}

module.exports = { parseCanada };
