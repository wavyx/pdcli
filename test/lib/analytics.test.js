import { describe, it, expect } from 'vitest'
import { parsePeriod } from '../../src/lib/period.js'
import {
  computeVelocity,
  computeFunnel,
  computeHealth,
  computeExactFunnel,
  computeCoverage,
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

describe('formatApiDatetime', () => {
  it('strips milliseconds (v2 query params reject them)', async () => {
    const { formatApiDatetime } = await import('../../src/lib/period.js')
    expect(formatApiDatetime(new Date('2026-06-04T12:00:00.123Z'))).toBe(
      '2026-06-04T12:00:00Z',
    )
  })
})

describe('computeHealth probability fallbacks', () => {
  it('defaults to 100% when neither deal nor stage has a probability', () => {
    const stages = [{ id: 1, name: 'S', pipeline_id: 1, order_nr: 0 }]
    const rows = computeHealth(
      [
        {
          id: 1,
          status: 'open',
          stage_id: 1,
          value: 100,
          probability: null,
          update_time: NOW.toISOString(),
          expected_close_date: null,
        },
      ],
      stages,
      [],
      { now: NOW },
    )
    expect(rows[0].weightedValue).toBe(100)
  })
})

describe('computeFunnel defaults', () => {
  it('works without an options argument', () => {
    const funnel = computeFunnel([], [], STAGES)
    expect(funnel).toHaveLength(3)
  })

  it('returns null conversion when nothing reached the previous stage', () => {
    const funnel = computeFunnel(
      [{ id: 1, status: 'lost', stage_id: 99 }], // unknown stage → reached nothing
      [],
      STAGES,
    )
    expect(funnel[1].conversionFromPrev).toBeNull()
  })
})

describe('computeExactFunnel', () => {
  // stage_id transition row helper (values are STRINGIFIED ints, as the API returns)
  const stage = (oldId, newId) => ({
    field_key: 'stage_id',
    old_value: oldId == null ? null : String(oldId),
    new_value: String(newId),
  })
  const status = (newStatus) => ({
    field_key: 'status',
    old_value: 'open',
    new_value: newStatus,
  })

  it('derives the starting stage from the OLDEST row when the changelog is newest-first', () => {
    // The live Pipedrive changelog returns rows NEWEST-FIRST. Chronological
    // history here is 1->2 (oldest), 2->3, 3->2 (newest). The true starting
    // stage is 1 (the oldest row's old_value), NOT 3 (the first row's
    // old_value in newest-first order). Rows carry 'time' (YYYY-MM-DD HH:MM:SS,
    // lexicographically sortable) and arrive newest-first.
    const stageAt = (oldId, newId, time) => ({
      field_key: 'stage_id',
      old_value: String(oldId),
      new_value: String(newId),
      time,
    })
    const transitionsByDeal = [
      {
        dealId: 1,
        stageId: 2,
        rows: [
          stageAt(3, 2, '2026-01-03 10:00:00'), // newest
          stageAt(2, 3, '2026-01-02 10:00:00'),
          stageAt(1, 2, '2026-01-01 10:00:00'), // oldest → true start is 1
        ],
      },
    ]

    const rows = computeExactFunnel(transitionsByDeal, STAGES)

    // Qualified (stage 1) is the TRUE starting stage and must be counted.
    expect(rows[0]).toMatchObject({ stage: 'Qualified', entered: 1 })
    // Demo (stage 2) and Negotiation (stage 3) were both observed via new_value.
    expect(rows[1]).toMatchObject({ stage: 'Demo', entered: 1 })
    expect(rows[2]).toMatchObject({ stage: 'Negotiation', entered: 1 })
  })

  it('counts distinct deals that ENTERED each stage from observed transitions', () => {
    const transitionsByDeal = [
      // deal A: 1 -> 2 -> 3, then won
      {
        dealId: 1,
        stageId: 3,
        rows: [stage(1, 2), stage(2, 3), status('won')],
      },
      // deal B: 1 -> 2, then lost
      { dealId: 2, stageId: 2, rows: [stage(1, 2), status('lost')] },
      // deal C: created directly in stage 3, no stage transitions → enters 3 ONLY
      { dealId: 3, stageId: 3, rows: [] },
    ]

    const rows = computeExactFunnel(transitionsByDeal, STAGES)

    expect(rows).toHaveLength(3)
    // Qualified (stage 1): A + B entered (started there). C did NOT.
    expect(rows[0]).toMatchObject({ stage: 'Qualified', entered: 2 })
    // Demo (stage 2): A + B entered.
    expect(rows[1]).toMatchObject({ stage: 'Demo', entered: 2 })
    // Negotiation (stage 3): A + C entered (B never reached it).
    expect(rows[2]).toMatchObject({ stage: 'Negotiation', entered: 2 })
  })

  it('computes stage->next conversion and a won count', () => {
    const transitionsByDeal = [
      {
        dealId: 1,
        stageId: 3,
        rows: [stage(1, 2), stage(2, 3), status('won')],
      },
      { dealId: 2, stageId: 2, rows: [stage(1, 2), status('lost')] },
      { dealId: 3, stageId: 3, rows: [] },
    ]

    const rows = computeExactFunnel(transitionsByDeal, STAGES)

    // first stage has no previous → null conversion
    expect(rows[0].conversionFromPrev).toBeNull()
    // Qualified(2) -> Demo(2): 2/2 = 1
    expect(rows[1].conversionFromPrev).toBeCloseTo(1)
    // Demo(2) -> Negotiation(2): 2/2 = 1
    expect(rows[2].conversionFromPrev).toBeCloseTo(1)
    // won count = deals with a status row new_value === 'won'
    expect(rows[0].won).toBe(1)
    expect(rows[1].won).toBe(1)
    expect(rows[2].won).toBe(1)
  })

  it('does NOT inflate later stages with skipped earlier stages (exact, not approximation)', () => {
    // deal jumped straight from stage 1 to stage 3, never entering stage 2
    const transitionsByDeal = [{ dealId: 1, stageId: 3, rows: [stage(1, 3)] }]
    const rows = computeExactFunnel(transitionsByDeal, STAGES)
    expect(rows[0]).toMatchObject({ stage: 'Qualified', entered: 1 })
    expect(rows[1]).toMatchObject({ stage: 'Demo', entered: 0 })
    expect(rows[2]).toMatchObject({ stage: 'Negotiation', entered: 1 })
  })

  it('counts a distinct deal only once per stage even if it re-enters', () => {
    // deal bounced 1 -> 2 -> 1 -> 2: stage 2 entered twice, but distinct count = 1
    const transitionsByDeal = [
      { dealId: 1, stageId: 2, rows: [stage(1, 2), stage(2, 1), stage(1, 2)] },
    ]
    const rows = computeExactFunnel(transitionsByDeal, STAGES)
    expect(rows[0].entered).toBe(1)
    expect(rows[1].entered).toBe(1)
    expect(rows[2].entered).toBe(0)
  })

  it('returns null conversion when nothing entered the previous stage', () => {
    // only deal enters stage 3 directly; stage 2 entered by nobody
    const transitionsByDeal = [{ dealId: 1, stageId: 3, rows: [] }]
    const rows = computeExactFunnel(transitionsByDeal, STAGES)
    expect(rows[1].entered).toBe(0)
    // Negotiation conversion divides by Demo(0) → null
    expect(rows[2].conversionFromPrev).toBeNull()
  })

  it('ignores stage transitions to/from stages outside the filtered pipeline', () => {
    const stages = [
      ...STAGES,
      { id: 9, name: 'Other', pipeline_id: 2, order_nr: 0 },
    ]
    // deal moved into stage 9 (other pipeline) then back to 2
    const transitionsByDeal = [
      { dealId: 1, stageId: 2, rows: [stage(1, 9), stage(9, 2)] },
    ]
    const rows = computeExactFunnel(transitionsByDeal, stages, {
      pipelineId: 1,
    })
    expect(rows.map((r) => r.stage)).toEqual([
      'Qualified',
      'Demo',
      'Negotiation',
    ])
    // stage 9 is excluded; deal still counted at stage 1 (initial) and stage 2
    expect(rows[0].entered).toBe(1)
    expect(rows[1].entered).toBe(1)
    expect(rows[2].entered).toBe(0)
  })

  it('ignores non-stage, non-status changelog rows', () => {
    const transitionsByDeal = [
      {
        dealId: 1,
        stageId: 2,
        rows: [
          { field_key: 'title', old_value: 'A', new_value: 'B' },
          { field_key: 'value', old_value: '0', new_value: '100' },
          stage(1, 2),
        ],
      },
    ]
    const rows = computeExactFunnel(transitionsByDeal, STAGES)
    expect(rows[0].entered).toBe(1)
    expect(rows[1].entered).toBe(1)
    expect(rows[0].won).toBe(0)
  })

  it('works without an options argument and with no deals', () => {
    const rows = computeExactFunnel([], STAGES)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.entered === 0)).toBe(true)
    expect(rows[0].won).toBe(0)
    expect(rows[0].conversionFromPrev).toBeNull()
  })
})

describe('null-value tolerance', () => {
  it('treats null won values as zero', () => {
    const v = computeVelocity(
      [
        {
          id: 1,
          status: 'won',
          value: null,
          won_time: daysAgo(5),
          add_time: daysAgo(10),
        },
      ],
      { since: parsePeriod('90d', NOW), now: NOW },
    )
    expect(v.avgWonValue).toBe(0)
  })

  it('treats null open values as zero in funnel and health', () => {
    const open = [
      {
        id: 5,
        status: 'open',
        stage_id: 1,
        value: null,
        probability: 50,
        update_time: NOW.toISOString(),
        expected_close_date: null,
      },
    ]
    const funnel = computeFunnel([], open, STAGES)
    expect(funnel[0].openValue).toBe(0)

    const rows = computeHealth(open, STAGES, [], { now: NOW })
    expect(rows[0].openValue).toBe(0)
    expect(rows[0].weightedValue).toBe(0)
  })
})

describe('computeCoverage', () => {
  it('divides weighted pipeline by the remaining-to-target gap', () => {
    // remaining = 100000 - 40000 = 60000; coverage = 180000 / 60000 = 3
    const c = computeCoverage({
      weightedOpen: 180000,
      goalTarget: 100000,
      progress: 40000,
    })
    expect(c.weightedOpen).toBe(180000)
    expect(c.goalTarget).toBe(100000)
    expect(c.progress).toBe(40000)
    expect(c.remaining).toBe(60000)
    expect(c.coverage).toBeCloseTo(3)
    expect(c.verdict).toBe('healthy')
  })

  it('classifies a borderline ratio (>=2 and <3)', () => {
    // remaining = 60000; coverage = 150000 / 60000 = 2.5
    const c = computeCoverage({
      weightedOpen: 150000,
      goalTarget: 100000,
      progress: 40000,
    })
    expect(c.coverage).toBeCloseTo(2.5)
    expect(c.verdict).toBe('borderline')
  })

  it('classifies a low ratio (<2)', () => {
    // remaining = 60000; coverage = 60000 / 60000 = 1
    const c = computeCoverage({
      weightedOpen: 60000,
      goalTarget: 100000,
      progress: 40000,
    })
    expect(c.coverage).toBeCloseTo(1)
    expect(c.verdict).toBe('low')
  })

  it('reports "covered" with null coverage when progress meets the target', () => {
    // remaining clamps to 0 → no gap left to cover → coverage is moot
    const c = computeCoverage({
      weightedOpen: 50000,
      goalTarget: 100000,
      progress: 100000,
    })
    expect(c.remaining).toBe(0)
    expect(c.coverage).toBeNull()
    expect(c.verdict).toBe('covered')
  })

  it('reports "covered" when progress exceeds the target (remaining clamps to 0)', () => {
    const c = computeCoverage({
      weightedOpen: 50000,
      goalTarget: 100000,
      progress: 130000,
    })
    expect(c.remaining).toBe(0)
    expect(c.coverage).toBeNull()
    expect(c.verdict).toBe('covered')
  })

  it('defaults progress to 0 when omitted', () => {
    // remaining = 100000; coverage = 300000 / 100000 = 3
    const c = computeCoverage({ weightedOpen: 300000, goalTarget: 100000 })
    expect(c.progress).toBe(0)
    expect(c.remaining).toBe(100000)
    expect(c.coverage).toBeCloseTo(3)
    expect(c.verdict).toBe('healthy')
  })
})
