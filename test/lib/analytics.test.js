import { describe, it, expect } from 'vitest'
import { parsePeriod } from '../../src/lib/period.js'
import {
  computeVelocity,
  computeFunnel,
  computeHealth,
} from '../../src/lib/analytics.js'

const NOW = new Date('2026-06-04T12:00:00Z')
const DAY = 86_400_000

function daysAgo(n) {
  return new Date(NOW.getTime() - n * DAY).toISOString()
}

const STAGES = [
  {
    id: 1,
    name: 'Qualified',
    pipeline_id: 1,
    order_nr: 0,
    deal_probability: 20,
  },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1, deal_probability: 50 },
  {
    id: 3,
    name: 'Negotiation',
    pipeline_id: 1,
    order_nr: 2,
    deal_probability: 80,
  },
]

describe('parsePeriod', () => {
  it('parses day periods', () => {
    const since = parsePeriod('90d', NOW)
    expect(since.toISOString()).toBe(daysAgo(90))
  })

  it('parses month periods (30d months)', () => {
    const since = parsePeriod('3m', NOW)
    expect(since.toISOString()).toBe(daysAgo(90))
  })

  it('throws 64 on garbage', () => {
    expect(() => parsePeriod('soon', NOW)).toThrow(/period/i)
  })
})

describe('computeVelocity', () => {
  const deals = [
    // 2 won in period: values 1000, 3000; cycles 10d, 20d
    {
      id: 1,
      status: 'won',
      value: 1000,
      won_time: daysAgo(5),
      add_time: daysAgo(15),
    },
    {
      id: 2,
      status: 'won',
      value: 3000,
      won_time: daysAgo(10),
      add_time: daysAgo(30),
    },
    // 1 lost in period
    { id: 3, status: 'lost', lost_time: daysAgo(3), add_time: daysAgo(40) },
    // won OUTSIDE period — ignored
    {
      id: 4,
      status: 'won',
      value: 99999,
      won_time: daysAgo(120),
      add_time: daysAgo(150),
    },
    // open deals: 3
    { id: 5, status: 'open', value: 500, add_time: daysAgo(7) },
    { id: 6, status: 'open', value: 800, add_time: daysAgo(2) },
    { id: 7, status: 'open', value: null, add_time: daysAgo(1) },
  ]

  it('computes the four levers and velocity per day', () => {
    const v = computeVelocity(deals, {
      since: parsePeriod('90d', NOW),
      now: NOW,
    })

    expect(v.openCount).toBe(3)
    expect(v.winRate).toBeCloseTo(2 / 3)
    expect(v.avgWonValue).toBe(2000)
    expect(v.avgCycleDays).toBe(15)
    // (3 × 2/3 × 2000) / 15 = 266.67
    expect(v.velocityPerDay).toBeCloseTo(266.67, 1)
    expect(v.wonCount).toBe(2)
    expect(v.lostCount).toBe(1)
  })

  it('returns null velocity when there are no closed deals in period', () => {
    const v = computeVelocity(
      [{ id: 5, status: 'open', value: 500, add_time: daysAgo(7) }],
      { since: parsePeriod('90d', NOW), now: NOW },
    )
    expect(v.velocityPerDay).toBeNull()
    expect(v.winRate).toBeNull()
  })
})

describe('computeFunnel', () => {
  it('builds stage-reach conversion from closed deals and open distribution', () => {
    const closed = [
      // won → reached every stage
      { id: 1, status: 'won', stage_id: 3 },
      { id: 2, status: 'won', stage_id: 3 },
      // lost at stage 2 → reached stages 1,2
      { id: 3, status: 'lost', stage_id: 2 },
      // lost at stage 1 → reached stage 1 only
      { id: 4, status: 'lost', stage_id: 1 },
    ]
    const open = [
      { id: 5, status: 'open', stage_id: 1, value: 100 },
      { id: 6, status: 'open', stage_id: 2, value: 200 },
    ]

    const funnel = computeFunnel(closed, open, STAGES)

    expect(funnel).toHaveLength(3)
    expect(funnel[0]).toMatchObject({
      stage: 'Qualified',
      reached: 4,
      openCount: 1,
      openValue: 100,
    })
    expect(funnel[1]).toMatchObject({ stage: 'Demo', reached: 3 })
    // conversion from Qualified to Demo: 3/4
    expect(funnel[1].conversionFromPrev).toBeCloseTo(0.75)
    expect(funnel[2]).toMatchObject({ stage: 'Negotiation', reached: 2 })
    expect(funnel[2].conversionFromPrev).toBeCloseTo(2 / 3)
    // overall win conversion appended on last stage record set
    expect(funnel[0].conversionFromPrev).toBeNull()
  })

  it('ignores stages from other pipelines', () => {
    const stages = [
      ...STAGES,
      { id: 9, name: 'Other', pipeline_id: 2, order_nr: 0 },
    ]
    const funnel = computeFunnel([], [], stages, { pipelineId: 1 })
    expect(funnel.map((f) => f.stage)).toEqual([
      'Qualified',
      'Demo',
      'Negotiation',
    ])
  })
})

describe('computeHealth', () => {
  const activities = [
    // future open activity on deal 5
    { id: 1, deal_id: 5, done: false, due_date: '2026-06-10' },
    // overdue activity on deal 6
    { id: 2, deal_id: 6, done: false, due_date: '2026-05-01' },
  ]

  const deals = [
    {
      id: 5,
      status: 'open',
      stage_id: 1,
      value: 500,
      probability: null,
      update_time: daysAgo(2),
      expected_close_date: '2026-07-01',
    },
    {
      id: 6,
      status: 'open',
      stage_id: 1,
      value: 1000,
      probability: 60,
      update_time: daysAgo(30), // stale
      expected_close_date: '2026-05-01', // past close
    },
    {
      id: 7,
      status: 'open',
      stage_id: 2,
      value: 2000,
      probability: null,
      update_time: daysAgo(1),
      expected_close_date: null,
    },
  ]

  it('aggregates per-stage counts, values, and flags', () => {
    const rows = computeHealth(deals, STAGES, activities, { now: NOW })

    const s1 = rows.find((r) => r.stage === 'Qualified')
    expect(s1.openCount).toBe(2)
    expect(s1.openValue).toBe(1500)
    // weighted: deal 5 uses stage probability 20% → 100; deal 6 own 60% → 600
    expect(s1.weightedValue).toBe(700)
    expect(s1.staleCount).toBe(1) // deal 6 >14d
    expect(s1.noNextActivityCount).toBe(1) // deal 6 has only overdue
    expect(s1.pastCloseCount).toBe(1) // deal 6

    const s2 = rows.find((r) => r.stage === 'Demo')
    expect(s2.openCount).toBe(1)
    // stage 2 prob 50% of 2000
    expect(s2.weightedValue).toBe(1000)
    expect(s2.noNextActivityCount).toBe(1) // deal 7 has no activities at all
  })
})
