import { describe, it, expect } from 'vitest'
import { computeTransitionMatrix } from '../../src/lib/conversion-matrix.js'

const STAGES = [
  { id: 1, name: 'Qualified', pipeline_id: 1, order_nr: 0 },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1 },
  { id: 3, name: 'Negotiation', pipeline_id: 1, order_nr: 2 },
]

// stage_id transition row (values STRINGIFIED ints, as the API returns).
const stage = (oldId, newId, time) => ({
  field_key: 'stage_id',
  old_value: oldId == null ? null : String(oldId),
  new_value: String(newId),
  time,
})
const status = (newStatus, time) => ({
  field_key: 'status',
  old_value: 'open',
  new_value: newStatus,
  time,
})

describe('computeTransitionMatrix', () => {
  it('counts a simple forward path 1->2->3 as one edge each', () => {
    const transitionsByDeal = [
      { dealId: 1, stageId: 3, rows: [stage(1, 2), stage(2, 3)] },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)

    // sources are stages in order_nr order
    expect(m.sources.map((s) => s.stage)).toEqual([
      'Qualified',
      'Demo',
      'Negotiation',
    ])
    // edge 1->2 and 2->3, each counted once
    expect(m.cell(1, 2)).toBe(1)
    expect(m.cell(2, 3)).toBe(1)
    // no other edges
    expect(m.cell(1, 3)).toBe(0)
    expect(m.cell(2, 1)).toBe(0)
  })

  it('counts a backward edge 2->1 and exposes it as a backward edge', () => {
    const transitionsByDeal = [
      { dealId: 1, stageId: 2, rows: [stage(1, 2), stage(2, 1), stage(1, 2)] },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)

    // EDGE occurrences (not distinct deals): 1->2 happened twice, 2->1 once.
    expect(m.cell(1, 2)).toBe(2)
    expect(m.cell(2, 1)).toBe(1)
    // backward edges are surfaced explicitly (the default funnel hides them)
    expect(m.backwardEdges).toContainEqual({
      from: 2,
      fromStage: 'Demo',
      to: 1,
      toStage: 'Qualified',
      count: 1,
    })
  })

  it('counts re-entry edges as separate edge occurrences', () => {
    // 1->2->1->2->3: 1->2 twice, 2->1 once, 2->3 once
    const transitionsByDeal = [
      {
        dealId: 7,
        stageId: 3,
        rows: [stage(1, 2), stage(2, 1), stage(1, 2), stage(2, 3)],
      },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)
    expect(m.cell(1, 2)).toBe(2)
    expect(m.cell(2, 1)).toBe(1)
    expect(m.cell(2, 3)).toBe(1)
  })

  it('derives Won/Lost terminal columns from status transitions', () => {
    const transitionsByDeal = [
      // deal A closed won from stage 3
      {
        dealId: 1,
        stageId: 3,
        rows: [stage(1, 2), stage(2, 3), status('won')],
      },
      // deal B closed lost from stage 2
      { dealId: 2, stageId: 2, rows: [stage(1, 2), status('lost')] },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)

    // won terminal edge attributed to the closing stage (3), lost to (2)
    expect(m.cell(3, 'won')).toBe(1)
    expect(m.cell(2, 'lost')).toBe(1)
    // the terminal destinations show up as destination keys
    expect(m.destinations.map((d) => d.key)).toContain('won')
    expect(m.destinations.map((d) => d.key)).toContain('lost')
  })

  it('reports per-source totals and forward-conversion rate', () => {
    // From stage 1: edges 1->2 (forward) and 1->2 again, plus a backward 2->1
    // out of stage 2. Stage 1 forward rate = forward edges / total out.
    const transitionsByDeal = [
      { dealId: 1, stageId: 2, rows: [stage(1, 2), stage(2, 1), stage(1, 2)] },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)

    const s1 = m.sources.find((s) => s.stageId === 1)
    // two edges leave stage 1, both forward (to stage 2, higher order)
    expect(s1.totalOut).toBe(2)
    expect(s1.forwardRate).toBeCloseTo(1)

    const s2 = m.sources.find((s) => s.stageId === 2)
    // one edge leaves stage 2: 2->1, which is BACKWARD
    expect(s2.totalOut).toBe(1)
    expect(s2.forwardRate).toBeCloseTo(0)
  })

  it('counts won/lost terminal edges as forward edges in the source rate', () => {
    // stage 3 -> won is terminal/forward; should make stage 3 forwardRate 1
    const transitionsByDeal = [
      { dealId: 1, stageId: 3, rows: [stage(2, 3), status('won')] },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)
    const s3 = m.sources.find((s) => s.stageId === 3)
    expect(s3.totalOut).toBe(1)
    expect(s3.forwardRate).toBeCloseTo(1)
  })

  it('scopes to a single pipeline and ignores out-of-pipeline stages', () => {
    const stages = [
      ...STAGES,
      { id: 9, name: 'Other', pipeline_id: 2, order_nr: 0 },
    ]
    // deal hops into stage 9 (other pipeline) then back to 2
    const transitionsByDeal = [
      { dealId: 1, stageId: 2, rows: [stage(1, 9), stage(9, 2)] },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, stages, {
      pipelineId: 1,
    })
    expect(m.sources.map((s) => s.stage)).toEqual([
      'Qualified',
      'Demo',
      'Negotiation',
    ])
    // edge 1->9 has an out-of-pipeline destination → dropped; 9->2 has an
    // out-of-pipeline source → dropped. No in-pipeline edges remain.
    expect(m.cell(1, 2)).toBe(0)
    const s1 = m.sources.find((s) => s.stageId === 1)
    expect(s1.totalOut).toBe(0)
    expect(s1.forwardRate).toBeNull()
  })

  it('returns an empty matrix (zeroed) for no deals', () => {
    const m = computeTransitionMatrix([], STAGES)
    expect(m.sources).toHaveLength(3)
    expect(m.sources.every((s) => s.totalOut === 0)).toBe(true)
    expect(m.sources.every((s) => s.forwardRate === null)).toBe(true)
    expect(m.backwardEdges).toEqual([])
    expect(m.cell(1, 2)).toBe(0)
    expect(m.cell(2, 'won')).toBe(0)
  })

  it('ignores non-stage, non-status rows and works without options', () => {
    const transitionsByDeal = [
      {
        dealId: 1,
        stageId: 2,
        rows: [
          { field_key: 'title', old_value: 'A', new_value: 'B' },
          stage(1, 2),
        ],
      },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)
    expect(m.cell(1, 2)).toBe(1)
  })

  it('ignores a stage_id row with a null source (deal created in a stage)', () => {
    // Some changelogs record the very first stage as old_value=null. There is
    // no real source edge, so it must not be counted.
    const transitionsByDeal = [
      { dealId: 1, stageId: 2, rows: [stage(null, 1), stage(1, 2)] },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)
    expect(m.cell(1, 2)).toBe(1)
    const s1 = m.sources.find((s) => s.stageId === 1)
    expect(s1.totalOut).toBe(1)
  })

  it('ignores a won/lost terminal when the closing stage is out of pipeline', () => {
    const stages = [
      ...STAGES,
      { id: 9, name: 'Other', pipeline_id: 2, order_nr: 0 },
    ]
    // deal currently sits in stage 9 (other pipeline) and was won there
    const transitionsByDeal = [{ dealId: 1, stageId: 9, rows: [status('won')] }]
    const m = computeTransitionMatrix(transitionsByDeal, stages, {
      pipelineId: 1,
    })
    // no in-pipeline terminal edge recorded
    expect(m.destinations.map((d) => d.key)).not.toContain('won')
    expect(m.sources.every((s) => s.totalOut === 0)).toBe(true)
  })

  it('exposes a long-format edge list for machine consumers', () => {
    const transitionsByDeal = [
      {
        dealId: 1,
        stageId: 3,
        rows: [stage(1, 2), stage(2, 3), status('won')],
      },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, STAGES)
    // edges is a flat [{from, fromStage, to, toStage, count, forward}] list
    expect(m.edges).toContainEqual({
      from: 1,
      fromStage: 'Qualified',
      to: 2,
      toStage: 'Demo',
      count: 1,
      forward: true,
    })
    expect(m.edges).toContainEqual({
      from: 3,
      fromStage: 'Negotiation',
      to: 'won',
      toStage: 'Won',
      count: 1,
      forward: true,
    })
  })

  it('does not count a lost terminal as forward progress in forwardRate', () => {
    const stages = [
      { id: 1, name: 'A', pipeline_id: 1, order_nr: 0 },
      { id: 2, name: 'B', pipeline_id: 1, order_nr: 1 },
    ]
    // From stage 1: one advance (1->2) and one loss (status lost @ stage 1).
    const transitionsByDeal = [
      { dealId: 1, stageId: 2, rows: [stage(1, 2)] },
      { dealId: 2, stageId: 1, rows: [status('lost')] },
    ]
    const m = computeTransitionMatrix(transitionsByDeal, stages, {})
    const s1 = m.sources.find((x) => x.stageId === 1)
    // 1 forward (advance) + 1 won-only-if-won... lost is NOT forward.
    // Two edges out of stage 1 (advance + lost); only the advance is forward.
    expect(s1.forwardRate).toBeCloseTo(0.5)
  })
})
