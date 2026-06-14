import { buildWriteBody } from './input.js'
import { CliError } from './errors.js'

/**
 * Turn parsed CSV rows into write bodies. Special columns (matched
 * case-insensitively) build typed values; every other header resolves
 * through the entity's field definitions — names, hash keys, and option
 * labels included. Empty cells are skipped.
 * @param {object} options
 * @param {string[]} options.headers
 * @param {string[][]} options.rows
 * @param {Record<string, (typed: object, value: string) => void>} [options.specialColumns]
 * @param {object[]} [options.defs] field definitions for non-special headers
 * @returns {object[]} one request body per row
 */
/**
 * Parse a CSV cell that must be an integer id (org_id, owner_id, …). A
 * non-integer (`Number('N/A')` → NaN, `'1.5'` → not integer) would otherwise
 * serialize as `null` in the write body and silently clear a relation —
 * refuse it as a data error instead.
 * @param {string} value
 * @param {string} field
 * @returns {number}
 */
export function intCell(value, field) {
  const n = Number(value)
  if (!Number.isInteger(n)) {
    throw new CliError(`"${value}" is not a valid ${field}`, { exitCode: 65 })
  }
  return n
}

export function prepareImportBodies({
  headers,
  rows,
  specialColumns = {},
  defs,
}) {
  const specials = Object.fromEntries(
    Object.entries(specialColumns).map(([k, v]) => [k.toLowerCase(), v]),
  )

  // Duplicate headers silently overwrite each other (last cell wins) — reject
  // them up front rather than losing a column's data without warning.
  const seen = new Set()
  for (const header of headers) {
    const lower = header.toLowerCase()
    if (seen.has(lower)) {
      throw new CliError(`Duplicate CSV column "${header}"`, { exitCode: 65 })
    }
    seen.add(lower)
  }

  return rows.map((row, index) => {
    try {
      const typed = {}
      const fields = []

      headers.forEach((header, i) => {
        const value = row[i]
        if (value === '') return
        const special = specials[header.toLowerCase()]
        if (special) {
          special(typed, value)
          return
        }
        fields.push(`${header}=${value}`)
      })

      return buildWriteBody({ typed, fields, defs })
    } catch (err) {
      // Prefix the row number onto any per-row failure (special-column
      // validation or buildWriteBody) so the user can find the bad cell.
      throw new CliError(`CSV row ${index + 2}: ${err.message}`, {
        exitCode: 65,
      })
    }
  })
}
