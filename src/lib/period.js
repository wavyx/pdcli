import { CliError } from './errors.js'

const DAY_MS = 86_400_000

/**
 * Parse a trailing period like "90d", "30d", or "3m" (months = 30 days)
 * into the start date of the window.
 * @param {string} period
 * @param {Date} [now]
 * @returns {Date}
 */
export function parsePeriod(period, now = new Date()) {
  const match = /^(\d+)([dm])$/.exec(period)
  if (!match) {
    throw new CliError(
      `Invalid period "${period}" — use Nd (days) or Nm (months), e.g. 90d`,
      { exitCode: 64 },
    )
  }
  const amount = Number(match[1])
  const days = match[2] === 'm' ? amount * 30 : amount
  return new Date(now.getTime() - days * DAY_MS)
}

/**
 * Format a date the way v2 query params accept it: RFC 3339 seconds
 * precision, no milliseconds (the API rejects fractional seconds).
 * @param {Date} date
 * @returns {string}
 */
export function formatApiDatetime(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Reduce a date string to its calendar-month key, "YYYY-MM". Works on a plain
 * `YYYY-MM-DD` (the format `expected_close_date` uses) or an RFC 3339 timestamp
 * by taking the leading year-month verbatim — no `Date` parsing, so a negative
 * timezone offset can never roll an end-of-month date into the previous month.
 * Returns null for a null/blank/unparseable value.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function closeMonthKey(value) {
  if (value == null || String(value).trim() === '') return null
  const match = /^(\d{4})-(\d{2})/.exec(String(value).trim())
  if (!match) return null
  const [, year, month] = match
  // Pipedrive legacy/imported records can carry a zero sentinel date
  // ("0000-00-00"); a non-calendar year/month is "no date", not a real month.
  const monthNum = Number(month)
  if (year === '0000' || monthNum < 1 || monthNum > 12) return null
  return `${year}-${month}`
}

/**
 * Resolve a `--since` value to an RFC3339 seconds string for `updated_since`.
 * Accepts a trailing period (Nd/Nm) or an absolute timestamp; rejects garbage
 * with a usage error (exit 64). Shared by `changes` and `sync warehouse`.
 * @param {string} value
 * @param {Date} [now]
 * @returns {string}
 */
export function resolveSince(value, now = new Date()) {
  if (/^\d+[dm]$/.test(value)) return formatApiDatetime(parsePeriod(value, now))
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    throw new CliError(
      `Invalid --since "${value}" — use an RFC3339 timestamp or Nd/Nm`,
      { exitCode: 64 },
    )
  }
  return formatApiDatetime(new Date(ms))
}
