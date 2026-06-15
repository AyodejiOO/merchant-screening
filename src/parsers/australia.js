const xlsx = require('xlsx');

// Australia DFAT Consolidated Sanctions List (XLSX)
// One row per name/alias — grouped by Reference to build entries with aliases
function parseAustralia(data) {
  const entries = [];

  let wb;
  try {
    // Accept Buffer, ArrayBuffer, or binary string
    const input = Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary');
    wb = xlsx.read(input, { type: 'buffer' });
  } catch (err) {
    console.error('[Parser:Australia] XLSX read error:', err.message);
    return entries;
  }

  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

  // Group rows by Reference — each Reference = one sanction entity
  const groups = new Map();
  for (const row of rows) {
    const ref = String(row['Reference'] || '').trim();
    if (!ref) continue;
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref).push(row);
  }

  for (const [ref, rowGroup] of groups) {
    try {
      // Find primary name row
      const primaryRow = rowGroup.find(r => r['Name Type'] === 'Primary Name') || rowGroup[0];
      const primaryName = (primaryRow['Name of Individual or Entity'] || '').trim();
      if (!primaryName) continue;

      // Collect aliases (all other rows for this Reference)
      const aliases = [];
      for (const r of rowGroup) {
        const n = (r['Name of Individual or Entity'] || '').trim();
        if (n && n !== primaryName) aliases.push(n);
      }

      const type       = (primaryRow['Type'] || '').toLowerCase();
      const entityType = type.includes('individual') ? 'individual' : 'entity';

      const country  = (primaryRow['Citizenship'] || primaryRow['Address'] || '').split(',')[0].trim();
      const program  = primaryRow['Committees'] || primaryRow['Instrument of Designation'] || '';
      const listing  = primaryRow['Listing Information'] || '';

      entries.push({
        list_source:     'AUSTRALIA',
        entity_type:     entityType,
        name:            primaryName,
        aliases:         JSON.stringify([...new Set(aliases)]),
        country,
        program,
        raw_id:          ref,
        additional_info: JSON.stringify({
          listingInfo:   listing,
          additionalInfo: primaryRow['Additional Information'] || '',
        }),
      });
    } catch (_) { /* skip malformed groups */ }
  }

  return entries;
}

module.exports = { parseAustralia };
