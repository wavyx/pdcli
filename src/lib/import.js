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
export function prepareImportBodies({
  headers,
  rows,
  specialColumns = {},
  defs,
}) {
  const specials = Object.fromEntries(
    Object.entries(specialColumns).map(([k, v]) => [k.toLowerCase(), v]),
  )

  return rows.map((row, index) => {
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

    try {
      return buildWriteBody({ typed, fields, defs })
    } catch (err) {
      throw new CliError(`CSV row ${index + 2}: ${err.message}`, {
        exitCode: 65,
      })
    }
  })
}
