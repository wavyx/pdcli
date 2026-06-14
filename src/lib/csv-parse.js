import { CliError } from './errors.js'

/**
 * Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, embedded
 * commas/newlines, CRLF). First record is the header row.
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(text) {
  // Strip a leading UTF-8 BOM (U+FEFF) so the first header is clean — Excel's
  // "CSV UTF-8" export and many Windows/Sheets tools emit one, which would
  // otherwise prepend U+FEFF to the first column name and break header matching.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const records = []
  let record = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      record.push(field)
      field = ''
      i++
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      field = ''
      if (record.length > 1 || record[0] !== '') records.push(record)
      record = []
      i++
      continue
    }
    field += char
    i++
  }

  if (inQuotes) {
    throw new CliError('Unterminated quoted field in CSV', { exitCode: 65 })
  }
  if (field !== '' || record.length > 0) {
    // A tail record only reaches here when non-empty (a bare trailing
    // newline never starts a record), so push unconditionally.
    record.push(field)
    records.push(record)
  }

  if (records.length === 0) {
    throw new CliError('CSV file is empty', { exitCode: 65 })
  }

  const [headers, ...rows] = records

  return {
    headers,
    rows: rows.map((row, index) => {
      if (row.length > headers.length) {
        throw new CliError(
          `CSV row ${index + 2} has ${row.length} cells but the header has ${headers.length}`,
          { exitCode: 65 },
        )
      }
      while (row.length < headers.length) row.push('')
      return row
    }),
  }
}
