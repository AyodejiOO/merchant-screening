const xml2js = require('xml2js');

async function parseOFAC(xmlData) {
  const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });
  const result = await parser.parseStringPromise(xmlData);

  const entries = [];
  const sdnEntries = result?.sdnList?.sdnEntry || [];

  for (const entry of sdnEntries) {
    try {
      const uid     = entry.uid?.[0]      || '';
      const sdnType = entry.sdnType?.[0]  || 'Entity';
      const last    = entry.lastName?.[0] || '';
      const first   = entry.firstName?.[0] || '';

      const name = sdnType === 'Individual'
        ? (first ? `${first} ${last}`.trim() : last)
        : last;
      if (!name) continue;

      const aliases = [];
      for (const aka of (entry.akaList?.[0]?.aka ?? [])) {
        const af = aka.firstName?.[0] || '';
        const al = aka.lastName?.[0]  || '';
        const an = af ? `${af} ${al}`.trim() : al;
        if (an && an !== name) aliases.push(an);
      }

      const programs = (entry.programList?.[0]?.program ?? []);

      let country = '';
      if (entry.addressList?.[0]?.address?.[0]?.country?.[0]) {
        country = entry.addressList[0].address[0].country[0];
      } else if (entry.nationalityList?.[0]?.nationality?.[0]?.country?.[0]) {
        country = entry.nationalityList[0].nationality[0].country[0];
      }

      entries.push({
        list_source:     'OFAC',
        entity_type:     sdnType === 'Individual' ? 'individual' : 'entity',
        name,
        aliases:         JSON.stringify(aliases),
        country,
        program:         programs.join(', '),
        raw_id:          uid,
        additional_info: JSON.stringify({ sdnType, programs }),
      });
    } catch (_) { /* skip malformed entries */ }
  }

  return entries;
}

module.exports = { parseOFAC };
