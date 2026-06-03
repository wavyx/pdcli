/**
 * Flatten a single record into [{ field, value }] rows for a transposed
 * key/value table view. custom_fields entries are hoisted to the top level
 * (callers resolve hash keys to names first via fields.makeResolver).
 * @param {object} record
 * @returns {{ field: string, value: string }[]}
 */
export function flattenRecord(record) {
  const rows = []
  for (const [field, value] of Object.entries(record)) {
    if (field === 'custom_fields' && value && typeof value === 'object') {
      for (const [name, customValue] of Object.entries(value)) {
        rows.push({ field: name, value: renderValue(customValue) })
      }
      continue
    }
    rows.push({ field, value: renderValue(value) })
  }
  return rows
}

function renderValue(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(renderValue).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
