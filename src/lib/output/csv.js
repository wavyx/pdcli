/**
 * @param {object[]} data
 * @param {Record<string, import('./table.js').Column>} columns
 * @returns {string}
 */
export function formatCsv(data, columns) {
  if (!data || data.length === 0) return ''
  let entries = Object.entries(columns)
  if (entries.length === 0) {
    // No explicit columns (the machine-format path passes {}). Derive a stable
    // column set from the union of the rows' own top-level keys, so csv emits
    // the data instead of a silently-blank header+rows — which, in a feed like
    // `changes --output csv`, would advance the watermark over rows that were
    // never written (silent data loss).
    const keys = []
    const seen = new Set()
    for (const row of data) {
      for (const k of Object.keys(row)) {
        if (!seen.has(k)) {
          seen.add(k)
          keys.push(k)
        }
      }
    }
    entries = keys.map((k) => [k, { header: k }])
  }
  const header = entries.map(([, col]) => col.header).join(',')
  const rows = data.map((row) =>
    entries
      .map(([key, col]) => {
        const val = col.get ? col.get(row) : row[col.key ?? key]
        return csvEscape(stringifyValue(val))
      })
      .join(','),
  )
  return [header, ...rows].join('\n')
}

/** Primitives stringify directly; objects/arrays become JSON (never the
 *  useless "[object Object]"); null/undefined become an empty cell. */
function stringifyValue(val) {
  if (val == null) return ''
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function csvEscape(val) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}
