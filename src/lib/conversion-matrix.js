/**
 * Stage-transition matrix mined from per-deal changelog history. Unlike the
 * funnel (which hides backward moves and collapses re-entries), this counts
 * EVERY stage_id transition as a directed edge old->new and reports each edge's
 * occurrence count. A deal that bounces 1->2->1->2 therefore contributes TWO
 * 1->2 edges and ONE 2->1 edge: we count edge OCCURRENCES, not distinct deals,
 * so re-entry and churn are visible rather than averaged away.
 *
 * Two synthetic terminal destinations, 'won' and 'lost', are derived from
 * `status` transitions (new_value won/lost). The terminal edge is attributed to
 * the stage the deal sat in when it closed — its current `stageId`.
 *
 * Each stage_id row already carries old_value->new_value, so an edge needs no
 * time/graph ordering to be counted (order between identical edges is
 * irrelevant to a count). The newest-first changelog order is thus harmless
 * here — there is no start-stage inference to get wrong.
 *
 * @param {{ dealId: number, stageId: number, rows: object[] }[]} transitionsByDeal
 *   one entry per mined deal: its current stage_id and raw changelog rows
 *   (each row: { field_key, old_value, new_value } — values stringified).
 * @param {object[]} stages v2 stages (id, name, order_nr, pipeline_id)
 * @param {{ pipelineId?: number }} [options]
 * @returns {{
 *   sources: { stageId: number, stage: string, order: number, totalOut: number,
 *     forwardRate: (number|null) }[],
 *   destinations: { key: (number|'won'|'lost'), label: string }[],
 *   matrix: Object<string, Object<string, number>>,
 *   edges: { from: number, fromStage: string, to: (number|'won'|'lost'),
 *     toStage: string, count: number, forward: boolean }[],
 *   backwardEdges: { from: number, fromStage: string, to: number,
 *     toStage: string, count: number }[],
 *   cell: (from: number, to: (number|'won'|'lost')) => number,
 * }}
 */
export function computeTransitionMatrix(
  transitionsByDeal,
  stages,
  options = {},
) {
  const ordered = stages
    .filter(
      (s) => options.pipelineId == null || s.pipeline_id === options.pipelineId,
    )
    .sort((a, b) => a.order_nr - b.order_nr)

  const orderById = new Map(ordered.map((s, i) => [s.id, i]))
  const nameById = new Map(ordered.map((s) => [s.id, s.name]))
  const inPipeline = (id) => orderById.has(id)

  // matrix[fromStageId][destKey] = edge occurrence count
  const matrix = new Map(ordered.map((s) => [s.id, new Map()]))
  const bump = (from, to) => {
    const row = matrix.get(from)
    row.set(to, (row.get(to) ?? 0) + 1)
  }

  for (const { stageId, rows } of transitionsByDeal) {
    for (const r of rows) {
      if (r.field_key === 'stage_id') {
        const from = Number(r.old_value)
        const to = Number(r.new_value)
        // Both ends must be in the scoped pipeline; the old_value can be null
        // for a deal's first observed stage (no real source edge there).
        if (r.old_value == null) continue
        if (!inPipeline(from) || !inPipeline(to)) continue
        bump(from, to)
      } else if (
        r.field_key === 'status' &&
        (r.new_value === 'won' || r.new_value === 'lost')
      ) {
        // Terminal edge from the closing stage to the won/lost column.
        if (!inPipeline(stageId)) continue
        bump(stageId, r.new_value)
      }
    }
  }

  // Terminal destinations appear only if at least one deal landed there.
  const terminals = []
  const hasTerminal = (key) =>
    ordered.some((s) => (matrix.get(s.id).get(key) ?? 0) > 0)
  if (hasTerminal('won')) terminals.push({ key: 'won', label: 'Won' })
  if (hasTerminal('lost')) terminals.push({ key: 'lost', label: 'Lost' })

  const destinations = [
    ...ordered.map((s) => ({ key: s.id, label: s.name })),
    ...terminals,
  ]

  const isForward = (from, to) => {
    if (to === 'won' || to === 'lost') return true
    return orderById.get(to) > orderById.get(from)
  }

  const labelFor = (to) =>
    to === 'won' ? 'Won' : to === 'lost' ? 'Lost' : nameById.get(to)

  const edges = []
  const backwardEdges = []
  const sources = ordered.map((s) => {
    const row = matrix.get(s.id)
    let totalOut = 0
    let forwardOut = 0
    for (const [to, count] of row) {
      totalOut += count
      const forward = isForward(s.id, to)
      if (forward) forwardOut += count
      edges.push({
        from: s.id,
        fromStage: s.name,
        to,
        toStage: labelFor(to),
        count,
        forward,
      })
      if (!forward) {
        backwardEdges.push({
          from: s.id,
          fromStage: s.name,
          to,
          toStage: labelFor(to),
          count,
        })
      }
    }
    return {
      stageId: s.id,
      stage: s.name,
      order: s.order_nr,
      totalOut,
      forwardRate: totalOut > 0 ? forwardOut / totalOut : null,
    }
  })

  const result = {
    sources,
    destinations,
    // Plain-object matrix for JSON consumers: { [fromId]: { [destKey]: n } }.
    matrix: Object.fromEntries(
      ordered.map((s) => [s.id, Object.fromEntries(matrix.get(s.id))]),
    ),
    edges,
    backwardEdges,
  }
  // `cell` is a non-enumerable lookup helper for callers/tests — it is left out
  // of JSON.stringify and object spreads so the serialized payload stays clean.
  Object.defineProperty(result, 'cell', {
    value: (from, to) => matrix.get(from)?.get(to) ?? 0,
    enumerable: false,
  })
  return result
}
