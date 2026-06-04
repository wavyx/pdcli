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
