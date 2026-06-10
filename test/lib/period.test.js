import { describe, it, expect } from 'vitest'
import {
  parsePeriod,
  formatApiDatetime,
  closeMonthKey,
} from '../../src/lib/period.js'

describe('parsePeriod', () => {
  const now = new Date('2026-06-10T00:00:00Z')

  it('parses days', () => {
    expect(parsePeriod('30d', now).toISOString()).toBe(
      '2026-05-11T00:00:00.000Z',
    )
  })

  it('parses months as 30 days', () => {
    expect(parsePeriod('3m', now).toISOString()).toBe(
      '2026-03-12T00:00:00.000Z',
    )
  })

  it('throws exit 64 on a malformed period', () => {
    let caught
    try {
      parsePeriod('soon', now)
    } catch (err) {
      caught = err
    }
    expect(caught.exitCode).toBe(64)
  })
})

describe('formatApiDatetime', () => {
  it('drops milliseconds to seconds precision', () => {
    expect(formatApiDatetime(new Date('2026-06-10T12:34:56.789Z'))).toBe(
      '2026-06-10T12:34:56Z',
    )
  })
})

describe('closeMonthKey', () => {
  it('reduces a YYYY-MM-DD date to its YYYY-MM month key', () => {
    expect(closeMonthKey('2026-07-15')).toBe('2026-07')
  })

  it('handles an RFC 3339 timestamp by taking its leading year-month', () => {
    expect(closeMonthKey('2026-11-02T10:00:00Z')).toBe('2026-11')
  })

  it('returns null for null/undefined', () => {
    expect(closeMonthKey(null)).toBeNull()
    expect(closeMonthKey(undefined)).toBeNull()
  })

  it('returns null for an empty or whitespace string', () => {
    expect(closeMonthKey('')).toBeNull()
    expect(closeMonthKey('   ')).toBeNull()
  })

  it('returns null for an unparseable value', () => {
    expect(closeMonthKey('someday')).toBeNull()
  })

  it('does not shift the month for an end-of-month date (no timezone math)', () => {
    // A naive Date(...).getMonth() in a negative-offset TZ could roll
    // 2026-01-31 back to December; the string-prefix approach must not.
    expect(closeMonthKey('2026-01-31')).toBe('2026-01')
  })
})
