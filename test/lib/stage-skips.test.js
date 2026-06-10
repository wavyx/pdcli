import { describe, it, expect } from 'vitest'
import { computeStageSkips } from '../../src/lib/stage-skips.js'

// Pipeline 1: stages 1,2,3,4 in order 0,1,2,3.
const STAGES = [
  { id: 1, name: 'Qualified', pipeline_id: 1, order_nr: 0 },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1 },
  { id: 3, name: 'Proposal', pipeline_id: 1, order_nr: 2 },
  { id: 4, name: 'Negotiation', pipeline_id: 1, order_nr: 3 },
]

// stage_id transition row helper — values are STRINGIFIED ints (API shape).
const stage = (oldId, newId, time, actor) => ({
  field_key: 'stage_id',
  old_value: oldId == null ? null : String(oldId),
  new_value: String(newId),
  time,
  actor_user_id: actor,
})

describe('computeStageSkips', () => {
  it('flags a forward skip (1->3 jumps over stage 2) and names the skipped gate', () => {
    const transitionsByDeal = [
      { dealId: 99, stageId: 3, rows: [stage(1, 3, '2026-01-01 10:00:00', 7)] },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      dealId: 99,
      kind: 'skip',
      from: { stageId: 1, name: 'Qualified', order: 0 },
      to: { stageId: 3, name: 'Proposal', order: 2 },
      skipped: ['Demo'],
      actor_user_id: 7,
      time: '2026-01-01 10:00:00',
    })
  })

  it('names every gate skipped on a multi-gate jump (1->4 skips Demo and Proposal)', () => {
    const transitionsByDeal = [
      { dealId: 1, stageId: 4, rows: [stage(1, 4, '2026-01-01 10:00:00', 5)] },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)

    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('skip')
    expect(findings[0].skipped).toEqual(['Demo', 'Proposal'])
  })

  it('flags a backward move (3->2 regression / sandbagging)', () => {
    const transitionsByDeal = [
      { dealId: 2, stageId: 2, rows: [stage(3, 2, '2026-01-02 09:00:00', 8)] },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      dealId: 2,
      kind: 'backward',
      from: { stageId: 3, name: 'Proposal', order: 2 },
      to: { stageId: 2, name: 'Demo', order: 1 },
      skipped: [],
      actor_user_id: 8,
    })
  })

  it('produces NO finding for a normal +1 advance (1->2)', () => {
    const transitionsByDeal = [
      { dealId: 3, stageId: 2, rows: [stage(1, 2, '2026-01-01 10:00:00', 1)] },
    ]

    expect(computeStageSkips(transitionsByDeal, STAGES)).toEqual([])
  })

  it('walks chronologically from a NEWEST-FIRST changelog (no false skip/backward)', () => {
    // Live changelog is newest-first. Chronological history is 1->2, 2->3,
    // 3->4 (all clean +1 advances). Naively walking the array as given
    // (newest-first) would read 4->3, 3->2, 2->1 and wrongly flag backwards.
    const transitionsByDeal = [
      {
        dealId: 4,
        stageId: 4,
        rows: [
          stage(3, 4, '2026-01-03 10:00:00', 1), // newest
          stage(2, 3, '2026-01-02 10:00:00', 1),
          stage(1, 2, '2026-01-01 10:00:00', 1), // oldest
        ],
      },
    ]

    expect(computeStageSkips(transitionsByDeal, STAGES)).toEqual([])
  })

  it('detects a skip mid-history when walked in chronological order', () => {
    // Chronological: 1->2 (clean), then 2->4 (skips Proposal).
    const transitionsByDeal = [
      {
        dealId: 5,
        stageId: 4,
        rows: [
          stage(2, 4, '2026-01-02 10:00:00', 9), // newest
          stage(1, 2, '2026-01-01 10:00:00', 9), // oldest
        ],
      },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      kind: 'skip',
      from: { stageId: 2, order: 1 },
      to: { stageId: 4, order: 3 },
      skipped: ['Proposal'],
      actor_user_id: 9,
    })
  })

  it('attributes findings to the actor on each transition independently', () => {
    // Chronological: 1->3 by user 7 (skip), then 3->2 by user 8 (backward).
    const transitionsByDeal = [
      {
        dealId: 6,
        stageId: 2,
        rows: [
          stage(3, 2, '2026-01-02 10:00:00', 8), // newest
          stage(1, 3, '2026-01-01 10:00:00', 7), // oldest
        ],
      },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)

    expect(findings).toHaveLength(2)
    const skip = findings.find((f) => f.kind === 'skip')
    const backward = findings.find((f) => f.kind === 'backward')
    expect(skip.actor_user_id).toBe(7)
    expect(backward.actor_user_id).toBe(8)
  })

  it('scopes stage order per pipeline (same order_nr in two pipelines is independent)', () => {
    // Pipeline 2 reuses order_nr 0/1 on different stage ids. A 1->2 move in
    // pipeline 1 is +1 (clean); a 10->12 move in pipeline 2 skips stage 11.
    const stages = [
      ...STAGES,
      { id: 10, name: 'P2 Lead', pipeline_id: 2, order_nr: 0 },
      { id: 11, name: 'P2 Mid', pipeline_id: 2, order_nr: 1 },
      { id: 12, name: 'P2 Close', pipeline_id: 2, order_nr: 2 },
    ]
    const transitionsByDeal = [
      { dealId: 7, stageId: 2, rows: [stage(1, 2, '2026-01-01 10:00:00', 1)] },
      {
        dealId: 8,
        stageId: 12,
        rows: [stage(10, 12, '2026-01-01 10:00:00', 1)],
      },
    ]

    const findings = computeStageSkips(transitionsByDeal, stages)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      dealId: 8,
      kind: 'skip',
      skipped: ['P2 Mid'],
    })
  })

  it('ignores a cross-pipeline stage move (order_nr is not comparable across pipelines)', () => {
    // Deal moved from pipeline 1 stage 1 (order 0) to pipeline 2 stage 12
    // (order 2). Comparing order_nr across pipelines is meaningless, so this
    // transition produces no skip/backward finding.
    const stages = [
      ...STAGES,
      { id: 12, name: 'P2 Close', pipeline_id: 2, order_nr: 2 },
    ]
    const transitionsByDeal = [
      {
        dealId: 9,
        stageId: 12,
        rows: [stage(1, 12, '2026-01-01 10:00:00', 1)],
      },
    ]

    expect(computeStageSkips(transitionsByDeal, stages)).toEqual([])
  })

  it('ignores transitions to/from unknown stage ids (deleted stages)', () => {
    const transitionsByDeal = [
      {
        dealId: 10,
        stageId: 999,
        rows: [stage(1, 999, '2026-01-01 10:00:00', 1)],
      },
    ]

    expect(computeStageSkips(transitionsByDeal, STAGES)).toEqual([])
  })

  it('ignores non-stage_id changelog rows', () => {
    const transitionsByDeal = [
      {
        dealId: 11,
        stageId: 3,
        rows: [
          { field_key: 'value', old_value: '0', new_value: '100', time: 't' },
          stage(1, 3, '2026-01-01 10:00:00', 4),
          {
            field_key: 'status',
            old_value: 'open',
            new_value: 'won',
            time: 't',
          },
        ],
      },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('skip')
  })

  it('returns an empty array for a deal with no stage transitions', () => {
    const transitionsByDeal = [{ dealId: 12, stageId: 1, rows: [] }]
    expect(computeStageSkips(transitionsByDeal, STAGES)).toEqual([])
  })

  it('ignores a hop between two stages sharing the same order_nr (lateral move)', () => {
    // Two stages can share an order_nr; a move between them is neither forward
    // nor backward, so it produces no finding.
    const stages = [
      { id: 1, name: 'A', pipeline_id: 1, order_nr: 0 },
      { id: 2, name: 'B', pipeline_id: 1, order_nr: 0 },
    ]
    const transitionsByDeal = [
      { dealId: 13, stageId: 2, rows: [stage(1, 2, '2026-01-01 10:00:00', 1)] },
    ]

    expect(computeStageSkips(transitionsByDeal, stages)).toEqual([])
  })

  it('falls back to a time sort when the transition graph is a cycle (re-entered stage)', () => {
    // History re-enters stage 1: 1->2 then 2->1. Every source is also a
    // destination, so there is no unique graph start — the time sort decides.
    // Chronological: 1->2 (clean +1), 2->1 (backward).
    const transitionsByDeal = [
      {
        dealId: 14,
        stageId: 1,
        rows: [
          stage(2, 1, '2026-01-02 10:00:00', 3), // newest
          stage(1, 2, '2026-01-01 10:00:00', 3), // oldest
        ],
      },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      kind: 'backward',
      from: { stageId: 2 },
      to: { stageId: 1 },
    })
  })

  it('falls back to a time sort when the graph branches (a stage left twice)', () => {
    // Single start (stage 1) but stage 2 is the source of two hops (2->3 and
    // 2->4): the chain walk cannot consume every row, so the time sort decides.
    // Chronological by time: 1->2, 2->3, 2->4 (deal pushed back to 2, then to 4).
    const transitionsByDeal = [
      {
        dealId: 15,
        stageId: 4,
        rows: [
          stage(2, 4, '2026-01-03 10:00:00', 2),
          stage(2, 3, '2026-01-02 10:00:00', 2),
          stage(1, 2, '2026-01-01 10:00:00', 2),
        ],
      },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)
    // 1->2 clean; 2->3 clean; 2->4 skips Proposal.
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: 'skip', skipped: ['Proposal'] })
  })

  it('tolerates rows without a time field when sorting (cycle fallback)', () => {
    // Cycle (no unique start) forces the time sort; rows carry no `time`, which
    // must not throw — they compare as equal-priority.
    const transitionsByDeal = [
      {
        dealId: 16,
        stageId: 1,
        rows: [stage(2, 1, undefined, 1), stage(1, 2, undefined, 1)],
      },
    ]

    // Order is undefined but both hops are between adjacent stages, so the
    // result is deterministic regardless of which sorts first: exactly one
    // backward (2->1) and one clean (1->2) advance.
    const findings = computeStageSkips(transitionsByDeal, STAGES)
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('backward')
  })

  it('aggregates findings across multiple deals', () => {
    const transitionsByDeal = [
      { dealId: 1, stageId: 3, rows: [stage(1, 3, '2026-01-01 10:00:00', 1)] },
      { dealId: 2, stageId: 2, rows: [stage(3, 2, '2026-01-01 10:00:00', 1)] },
      { dealId: 3, stageId: 2, rows: [stage(1, 2, '2026-01-01 10:00:00', 1)] },
    ]

    const findings = computeStageSkips(transitionsByDeal, STAGES)
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => f.dealId).sort()).toEqual([1, 2])
  })
})
