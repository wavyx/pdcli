import { describe, it, expect } from 'vitest'
import { computeForecast } from '../../src/lib/forecast.js'

const STAGES = [
  { id: 1, name: 'Qualify', order_nr: 0, deal_probability: 40 },
  { id: 2, name: 'Propose', order_nr: 1, deal_probability: 80 },
]

const DEALS = [
  // USD 2026-07: stage-1 default 40%
  {
    id: 1,
    currency: 'USD',
    value: 100000,
    probability: null,
    stage_id: 1,
    expected_close_date: '2026-07-15',
  },
  // USD 2026-07: per-deal override 90% (overrides stage default)
  {
    id: 2,
    currency: 'USD',
    value: 50000,
    probability: 90,
    stage_id: 1,
    expected_close_date: '2026-07-20',
  },
  // USD 2026-08: stage-2 default 80%
  {
    id: 3,
    currency: 'USD',
    value: 80000,
    probability: null,
    stage_id: 2,
    expected_close_date: '2026-08-05',
  },
  // EUR 2026-07: stage-2 default 80%
  {
    id: 4,
    currency: 'EUR',
    value: 40000,
    probability: null,
    stage_id: 2,
    expected_close_date: '2026-07-10',
  },
  // USD no-date: stage-1 40%, no close date
  {
    id: 5,
    currency: 'USD',
    value: 20000,
    probability: null,
    stage_id: 1,
    expected_close_date: null,
  },
]

describe('computeForecast', () => {
  it('buckets open deals by currency then close-month with commit/best/weighted', () => {
    const { rows } = computeForecast(DEALS, STAGES, { commitThreshold: 70 })

    // Sorted: EUR first, then USD months ascending, no-date last within currency.
    expect(rows.map((r) => `${r.currency} ${r.month}`)).toEqual([
      'EUR 2026-07',
      'USD 2026-07',
      'USD 2026-08',
      'USD no-date',
    ])

    const usdJul = rows.find(
      (r) => r.currency === 'USD' && r.month === '2026-07',
    )
    expect(usdJul.dealCount).toBe(2)
    expect(usdJul.bestCase).toBe(150000)
    // 100000*0.40 + 50000*0.90 = 40000 + 45000
    expect(usdJul.weighted).toBe(85000)
    // only deal 2 (90% >= 70) commits, at full value
    expect(usdJul.commit).toBe(50000)

    const eurJul = rows.find((r) => r.currency === 'EUR')
    expect(eurJul.weighted).toBe(32000)
    expect(eurJul.commit).toBe(40000)

    const usdNoDate = rows.find((r) => r.month === 'no-date')
    expect(usdNoDate.commit).toBe(0)
    expect(usdNoDate.weighted).toBe(8000)
  })

  it('rolls per-currency totals across months', () => {
    const { totals } = computeForecast(DEALS, STAGES, { commitThreshold: 70 })
    expect(totals.map((t) => t.currency)).toEqual(['EUR', 'USD'])

    const usd = totals.find((t) => t.currency === 'USD')
    expect(usd.dealCount).toBe(4)
    expect(usd.bestCase).toBe(250000)
    expect(usd.weighted).toBe(157000)
    expect(usd.commit).toBe(130000) // 50000 + 80000 + 0
  })

  it('defaults the commit threshold to 70 when omitted', () => {
    const { totals } = computeForecast(DEALS, STAGES)
    const usd = totals.find((t) => t.currency === 'USD')
    expect(usd.commit).toBe(130000)
  })

  it('respects a deal probability of 0 rather than falling back to 100', () => {
    const { totals } = computeForecast(
      [
        {
          id: 9,
          currency: 'USD',
          value: 10000,
          probability: 0,
          stage_id: 1,
          expected_close_date: '2026-07-01',
        },
      ],
      STAGES,
    )
    expect(totals[0].weighted).toBe(0)
    expect(totals[0].commit).toBe(0)
    expect(totals[0].bestCase).toBe(10000)
  })

  it('includes a deal exactly at the commit threshold', () => {
    const { totals } = computeForecast(
      [
        {
          id: 9,
          currency: 'USD',
          value: 10000,
          probability: 70,
          stage_id: 1,
          expected_close_date: '2026-07-01',
        },
      ],
      STAGES,
      { commitThreshold: 70 },
    )
    expect(totals[0].commit).toBe(10000)
  })

  it('falls back to 100% when neither deal nor stage carries a probability', () => {
    const { totals } = computeForecast(
      [
        {
          id: 9,
          currency: 'USD',
          value: 10000,
          probability: null,
          stage_id: 999, // unknown stage
          expected_close_date: '2026-07-01',
        },
      ],
      STAGES,
    )
    expect(totals[0].weighted).toBe(10000)
    expect(totals[0].commit).toBe(10000)
  })

  it('treats a null value as 0 and a null currency as "(none)"', () => {
    const { rows } = computeForecast(
      [
        {
          id: 9,
          currency: null,
          value: null,
          probability: 100,
          stage_id: 1,
          expected_close_date: '2026-07-01',
        },
      ],
      STAGES,
    )
    expect(rows[0].currency).toBe('(none)')
    expect(rows[0].bestCase).toBe(0)
  })

  it('returns empty rows and totals for no deals', () => {
    expect(computeForecast([], STAGES)).toEqual({ rows: [], totals: [] })
  })
})
