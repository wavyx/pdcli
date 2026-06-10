import { describe, it, expect } from 'vitest'
import { computeStageDwell, computeAging } from '../../src/lib/aging.js'

const NOW = new Date('2026-06-04T12:00:00Z')
const DAY = 86_400_000

function daysAgo(n) {
  return new Date(NOW.getTime() - n * DAY).toISOString()
}

const STAGES = [
  { id: 1, name: 'Qualified', pipeline_id: 1, order_nr: 0 },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1 },
  { id: 3, name: 'Negotiation', pipeline_id: 1, order_nr: 2 },
]

/** Build a stage_id changelog row (values are stringified, as the API sends). */
const stageRow = (oldId, newId, time) => ({
  field_key: 'stage_id',
  old_value: oldId == null ? null : String(oldId),
  new_value: String(newId),
  time,
})

describe('computeStageDwell', () => {
  it('computes completed dwell distribution per stage across deals', () => {
    // deal 10 history (newest-first, as the API returns it):
    //   entered 1 @ 30d ago, entered 2 @ 20d ago, entered 3 @ 10d ago
    //   → dwell in 1 = 10d, dwell in 2 = 10d
    // deal 11: entered 1 @ 50d ago, entered 2 @ 30d ago
    //   → dwell in 1 = 20d
    const transitionsByDeal = [
      {
        dealId: 10,
        stageId: 3,
        rows: [
          stageRow(2, 3, daysAgo(10)),
          stageRow(1, 2, daysAgo(20)),
          stageRow(0, 1, daysAgo(30)),
        ],
      },
      {
        dealId: 11,
        stageId: 2,
        rows: [stageRow(1, 2, daysAgo(30)), stageRow(0, 1, daysAgo(50))],
      },
    ]

    const dwell = computeStageDwell(transitionsByDeal, STAGES)
    const byId = new Map(dwell.map((d) => [d.stageId, d]))

    // stage 1: two completed dwells (10d, 20d). p50 is nearest-rank, so on
    // an even sample [10,20] it returns the lower value (10), not the mean.
    expect(byId.get(1).count).toBe(2)
    expect(byId.get(1).p50).toBeCloseTo(10)
    expect(byId.get(1).maxDays).toBeCloseTo(20)
    // stage 2: one completed dwell (10d, from deal 10)
    expect(byId.get(2).count).toBe(1)
    expect(byId.get(2).p50).toBeCloseTo(10)
    // stage 3: never exited → no completed dwell
    expect(byId.get(3).count).toBe(0)
    expect(byId.get(3).p50).toBeNull()
    expect(byId.get(3).p90).toBeNull()
    expect(byId.get(3).maxDays).toBeNull()
  })

  it('carries stage name and id and is ordered by order_nr', () => {
    const dwell = computeStageDwell([], STAGES)
    expect(dwell.map((d) => d.stageName)).toEqual([
      'Qualified',
      'Demo',
      'Negotiation',
    ])
    expect(dwell.map((d) => d.stageId)).toEqual([1, 2, 3])
  })

  it('orders transitions by the graph when timestamps tie to the second', () => {
    // Both hops share the same second; an ascending time sort cannot order
    // them, so the graph (old→new chain) must reconstruct 1→2 then 2→3, NOT
    // 2→3 then 1→2. Mis-ordering would make stage 2's dwell negative. The
    // starting stage (1) has no timestamped entry, so only 2 and 3 get
    // entries; stage 2's completed dwell (enter2 → enter3) must be 0, never
    // negative.
    const t = daysAgo(10)
    const transitionsByDeal = [
      {
        dealId: 12,
        stageId: 3,
        // newest-first AND same second: 2->3 listed before 1->2
        rows: [stageRow(2, 3, t), stageRow(1, 2, t)],
      },
    ]
    const dwell = computeStageDwell(transitionsByDeal, STAGES)
    const byId = new Map(dwell.map((d) => [d.stageId, d]))
    // starting stage 1 has no timestamped entry → no completed dwell
    expect(byId.get(1).count).toBe(0)
    // stage 2 entered, then stage 3 entered at the same instant → dwell 0
    expect(byId.get(2).count).toBe(1)
    expect(byId.get(2).maxDays).toBeCloseTo(0)
    expect(byId.get(2).maxDays).toBeGreaterThanOrEqual(0)
  })

  it('ignores non-stage_id rows', () => {
    const transitionsByDeal = [
      {
        dealId: 13,
        stageId: 2,
        rows: [
          {
            field_key: 'status',
            old_value: 'open',
            new_value: 'won',
            time: daysAgo(5),
          },
          stageRow(1, 2, daysAgo(10)),
          stageRow(0, 1, daysAgo(20)),
        ],
      },
    ]
    const dwell = computeStageDwell(transitionsByDeal, STAGES)
    const byId = new Map(dwell.map((d) => [d.stageId, d]))
    // stage 1 dwell = 10d (entered 1 @20d, entered 2 @10d)
    expect(byId.get(1).count).toBe(1)
    expect(byId.get(1).maxDays).toBeCloseTo(10)
  })

  it('skips deals with no stage transitions (dwell unknown)', () => {
    const dwell = computeStageDwell(
      [{ dealId: 14, stageId: 1, rows: [] }],
      STAGES,
    )
    expect(dwell.every((d) => d.count === 0)).toBe(true)
  })

  it('ignores transitions into stages outside the given pipeline', () => {
    // A deal hops 1 -> 99 (stage 99 belongs to another pipeline, not in STAGES)
    // -> 2. The dwell in stage 99 must be dropped (no bucket for it); the dwell
    // in stage 1 (entry1 -> entry99) is still recorded.
    const transitionsByDeal = [
      {
        dealId: 15,
        stageId: 2,
        rows: [
          stageRow(99, 2, daysAgo(5)),
          stageRow(1, 99, daysAgo(10)),
          stageRow(0, 1, daysAgo(20)),
        ],
      },
    ]
    const dwell = computeStageDwell(transitionsByDeal, STAGES)
    const byId = new Map(dwell.map((d) => [d.stageId, d]))
    // stage 1 dwell = entry99 - entry1 = 20 - 10 = 10d
    expect(byId.get(1).count).toBe(1)
    expect(byId.get(1).maxDays).toBeCloseTo(10)
    // no phantom stage rows leak into known stages 2/3
    expect(byId.get(2).count).toBe(0)
    expect(byId.get(3).count).toBe(0)
  })

  it('tolerates changelog rows with a missing timestamp', () => {
    // A stage_id row with no `time` sorts first (empty string) and produces an
    // Invalid Date entry, but must not throw; the other dwell still computes.
    const transitionsByDeal = [
      {
        dealId: 16,
        stageId: 3,
        rows: [
          stageRow(2, 3, daysAgo(10)),
          { field_key: 'stage_id', old_value: '1', new_value: '2' }, // no time
          stageRow(0, 1, daysAgo(30)),
        ],
      },
    ]
    expect(() => computeStageDwell(transitionsByDeal, STAGES)).not.toThrow()
  })

  it('handles a pure cycle where every source is also a destination', () => {
    // 1->2 and 2->1: both 1 and 2 appear as destinations, so the start cannot
    // be derived from the graph; it falls back to the earliest row's source.
    const transitionsByDeal = [
      {
        dealId: 17,
        stageId: 1,
        rows: [stageRow(2, 1, daysAgo(5)), stageRow(1, 2, daysAgo(10))],
      },
    ]
    expect(() => computeStageDwell(transitionsByDeal, STAGES)).not.toThrow()
    const byId = new Map(
      computeStageDwell(transitionsByDeal, STAGES).map((d) => [d.stageId, d]),
    )
    // entries reconstructed oldest-first: enter 2 @10d, enter 1 @5d → stage 2
    // dwell = 5d
    expect(byId.get(2).count).toBe(1)
    expect(byId.get(2).maxDays).toBeCloseTo(5)
  })

  it('falls back to earliest row when same-second rows do not chain', () => {
    // Two rows at the SAME second that do not form a chain from the start
    // stage: 1->2 and 3->1 both @ t. The graph tie-break finds no row whose
    // old_value matches `current`, so it falls back to the earliest (index 0).
    const t = daysAgo(8)
    const transitionsByDeal = [
      {
        dealId: 18,
        stageId: 2,
        rows: [stageRow(1, 2, t), stageRow(3, 1, t)],
      },
    ]
    expect(() => computeStageDwell(transitionsByDeal, STAGES)).not.toThrow()
  })

  it('computes p90 from a larger sample', () => {
    // 10 completed dwells in stage 1: 1..10 days. p90 (nearest-rank) = 9.
    const rows = (n) => [
      stageRow(1, 2, daysAgo(20 - n)),
      stageRow(0, 1, daysAgo(20)),
    ]
    const transitionsByDeal = Array.from({ length: 10 }, (_, i) => ({
      dealId: 100 + i,
      stageId: 2,
      rows: rows(i + 1), // dwell = (20-n) - 20 ... wait, entered1@20, entered2@(20-(i+1)) → dwell=i+1
    }))
    const dwell = computeStageDwell(transitionsByDeal, STAGES)
    const s1 = dwell.find((d) => d.stageId === 1)
    expect(s1.count).toBe(10)
    expect(s1.maxDays).toBeCloseTo(10)
    // nearest-rank p90 of [1..10] = value at ceil(0.9*10)=9th → 9
    expect(s1.p90).toBeCloseTo(9)
  })
})

describe('computeAging', () => {
  const openDeals = [
    { id: 1, stage_id: 1, value: 100 },
    { id: 2, stage_id: 1, value: 200 },
    { id: 3, stage_id: 2, value: 500 },
  ]

  it('buckets open deals by days-in-current-stage', () => {
    // deal 1 entered stage 1 @ 10d ago → 0-30 bucket
    // deal 2 entered stage 1 @ 45d ago → 30-60 bucket
    // deal 3 entered stage 2 @ 100d ago → 90+ bucket
    const transitionsByDeal = [
      { dealId: 1, stageId: 1, rows: [stageRow(0, 1, daysAgo(10))] },
      { dealId: 2, stageId: 1, rows: [stageRow(0, 1, daysAgo(45))] },
      { dealId: 3, stageId: 2, rows: [stageRow(1, 2, daysAgo(100))] },
    ]
    const result = computeAging(openDeals, transitionsByDeal, STAGES, {
      now: NOW,
      buckets: [30, 60, 90],
    })
    const byId = new Map(result.map((r) => [r.stageId, r]))

    // Stage 1: deal 1 in 0-30, deal 2 in 30-60
    expect(byId.get(1).buckets['0-30'].count).toBe(1)
    expect(byId.get(1).buckets['0-30'].value).toBe(100)
    expect(byId.get(1).buckets['30-60'].count).toBe(1)
    expect(byId.get(1).buckets['30-60'].value).toBe(200)
    expect(byId.get(1).buckets['60-90'].count).toBe(0)
    expect(byId.get(1).buckets['90+'].count).toBe(0)
    // Stage 2: deal 3 in 90+
    expect(byId.get(2).buckets['90+'].count).toBe(1)
    expect(byId.get(2).buckets['90+'].value).toBe(500)
  })

  it('treats the bucket lower bound as inclusive (exactly 30d → 30-60)', () => {
    // A deal at EXACTLY 30 days lands in 30-60, not 0-30.
    const transitionsByDeal = [
      { dealId: 1, stageId: 1, rows: [stageRow(0, 1, daysAgo(30))] },
    ]
    const result = computeAging(
      [{ id: 1, stage_id: 1, value: 100 }],
      transitionsByDeal,
      STAGES,
      { now: NOW, buckets: [30, 60, 90] },
    )
    const s1 = result.find((r) => r.stageId === 1)
    expect(s1.buckets['0-30'].count).toBe(0)
    expect(s1.buckets['30-60'].count).toBe(1)
  })

  it('flags deals exceeding the stage p90 dwell', () => {
    // Build dwell history so stage 1 p90 is ~10d, then an open deal sitting
    // 40 days in stage 1 should be flagged.
    const history = Array.from({ length: 10 }, (_, i) => ({
      dealId: 200 + i,
      stageId: 2,
      // dwell in stage 1 = i+1 days
      rows: [
        stageRow(1, 2, daysAgo(20 - (i + 1))),
        stageRow(0, 1, daysAgo(20)),
      ],
    }))
    const open = [{ id: 1, stage_id: 1, value: 100 }]
    const openTransitions = [
      { dealId: 1, stageId: 1, rows: [stageRow(0, 1, daysAgo(40))] },
    ]
    const result = computeAging(
      open,
      [...history, ...openTransitions],
      STAGES,
      { now: NOW, buckets: [30, 60, 90] },
    )
    const s1 = result.find((r) => r.stageId === 1)
    // p90 of [1..10] = 9; the open deal at 40d exceeds it
    expect(s1.p90Days).toBeCloseTo(9)
    expect(s1.p90ExceededCount).toBe(1)
  })

  it('does not flag p90 when the stage has no completed dwell history', () => {
    const open = [{ id: 1, stage_id: 1, value: 100 }]
    const openTransitions = [
      { dealId: 1, stageId: 1, rows: [stageRow(0, 1, daysAgo(200))] },
    ]
    const result = computeAging(open, openTransitions, STAGES, {
      now: NOW,
      buckets: [30, 60, 90],
    })
    const s1 = result.find((r) => r.stageId === 1)
    expect(s1.p90Days).toBeNull()
    expect(s1.p90ExceededCount).toBe(0)
  })

  it('skips open deals with no entry into their current stage (dwell unknown)', () => {
    // deal has transitions but none INTO its current stage (stage 3) → unknown
    const open = [{ id: 1, stage_id: 3, value: 100 }]
    const transitionsByDeal = [
      { dealId: 1, stageId: 3, rows: [stageRow(0, 1, daysAgo(10))] },
    ]
    const result = computeAging(open, transitionsByDeal, STAGES, {
      now: NOW,
      buckets: [30, 60, 90],
    })
    const s3 = result.find((r) => r.stageId === 3)
    // not bucketed anywhere
    expect(s3.buckets['0-30'].count).toBe(0)
    expect(s3.buckets['30-60'].count).toBe(0)
    expect(s3.buckets['60-90'].count).toBe(0)
    expect(s3.buckets['90+'].count).toBe(0)
    expect(s3.unknownCount).toBe(1)
  })

  it('uses the LATEST entry into the current stage (re-entry resets the clock)', () => {
    // deal 1 in stage 1: entered 1 @60d, moved to 2 @50d, came back to 1 @5d.
    // Days-in-stage must use the LATEST entry (5d), not the first (60d).
    const open = [{ id: 1, stage_id: 1, value: 100 }]
    const transitionsByDeal = [
      {
        dealId: 1,
        stageId: 1,
        rows: [
          stageRow(2, 1, daysAgo(5)),
          stageRow(1, 2, daysAgo(50)),
          stageRow(0, 1, daysAgo(60)),
        ],
      },
    ]
    const result = computeAging(open, transitionsByDeal, STAGES, {
      now: NOW,
      buckets: [30, 60, 90],
    })
    const s1 = result.find((r) => r.stageId === 1)
    expect(s1.buckets['0-30'].count).toBe(1) // 5 days, not 60
    expect(s1.buckets['90+'].count).toBe(0)
  })

  it('handles a missing deal value as 0 in bucket value sums', () => {
    const open = [{ id: 1, stage_id: 1 }]
    const transitionsByDeal = [
      { dealId: 1, stageId: 1, rows: [stageRow(0, 1, daysAgo(10))] },
    ]
    const result = computeAging(open, transitionsByDeal, STAGES, {
      now: NOW,
      buckets: [30, 60, 90],
    })
    const s1 = result.find((r) => r.stageId === 1)
    expect(s1.buckets['0-30'].count).toBe(1)
    expect(s1.buckets['0-30'].value).toBe(0)
  })

  it('returns one row per stage, ordered by order_nr, with empty buckets when no deals', () => {
    const result = computeAging([], [], STAGES, {
      now: NOW,
      buckets: [30, 60, 90],
    })
    expect(result.map((r) => r.stage)).toEqual([
      'Qualified',
      'Demo',
      'Negotiation',
    ])
    for (const row of result) {
      expect(row.buckets['0-30'].count).toBe(0)
      expect(row.p90ExceededCount).toBe(0)
      expect(row.unknownCount).toBe(0)
    }
  })

  it('supports custom bucket thresholds', () => {
    // buckets [7,14] → cohorts 0-7 / 7-14 / 14+
    const open = [
      { id: 1, stage_id: 1, value: 10 },
      { id: 2, stage_id: 1, value: 20 },
      { id: 3, stage_id: 1, value: 30 },
    ]
    const transitionsByDeal = [
      { dealId: 1, stageId: 1, rows: [stageRow(0, 1, daysAgo(3))] },
      { dealId: 2, stageId: 1, rows: [stageRow(0, 1, daysAgo(10))] },
      { dealId: 3, stageId: 1, rows: [stageRow(0, 1, daysAgo(20))] },
    ]
    const result = computeAging(open, transitionsByDeal, STAGES, {
      now: NOW,
      buckets: [7, 14],
    })
    const s1 = result.find((r) => r.stageId === 1)
    expect(s1.buckets['0-7'].count).toBe(1)
    expect(s1.buckets['7-14'].count).toBe(1)
    expect(s1.buckets['14+'].count).toBe(1)
  })
})
