/**
 * Stage-skip / sandbagging compliance, mined from per-deal changelog history.
 *
 * Walks each deal's stage_id transitions CHRONOLOGICALLY and, for every hop,
 * compares the source and destination stages' order_nr WITHIN THE SAME
 * pipeline:
 *   - FORWARD SKIP  — destination order_nr > source order_nr + 1: the deal
 *     jumped over one or more gates (`skipped` names them).
 *   - BACKWARD MOVE — destination order_nr < source order_nr: a regression
 *     (often sandbagging — pulling a deal back to look conservative).
 *   - A clean +1 advance produces no finding.
 *
 * Cross-pipeline hops are IGNORED: order_nr only orders stages within a single
 * pipeline, so comparing it across pipelines is meaningless. Hops touching a
 * stage id not in `stages` (e.g. a since-deleted stage) are likewise ignored.
 *
 * The live changelog arrives NEWEST-FIRST, so the rows are reordered
 * chronologically before walking — naively trusting array order would invert
 * every advance into a phantom backward move. Ordering is derived from the
 * transition graph (the source stage that never appears as a destination is
 * the start) and falls back to a time sort for degenerate cycles, mirroring
 * computeExactFunnel.
 *
 * @param {{ dealId: number, stageId: number, rows: object[] }[]} transitionsByDeal
 *   one entry per mined deal; each row is a changelog entry
 *   ({ field_key, old_value, new_value, time, actor_user_id }, values stringified).
 * @param {object[]} stages v2 stages (id, name, order_nr, pipeline_id)
 * @returns {{ dealId: number, kind: 'skip'|'backward',
 *   from: { stageId: number, name: string, order: number },
 *   to: { stageId: number, name: string, order: number },
 *   skipped: string[], actor_user_id: any, time: any }[]}
 */
export function computeStageSkips(transitionsByDeal, stages) {
  const stageById = new Map(stages.map((s) => [s.id, s]))
  // Stage ids ordered by order_nr, per pipeline — used to name skipped gates.
  const orderedByPipeline = new Map()
  for (const s of stages) {
    if (!orderedByPipeline.has(s.pipeline_id)) {
      orderedByPipeline.set(s.pipeline_id, [])
    }
    orderedByPipeline.get(s.pipeline_id).push(s)
  }
  for (const list of orderedByPipeline.values()) {
    list.sort((a, b) => a.order_nr - b.order_nr)
  }

  const findings = []

  for (const { dealId, rows } of transitionsByDeal) {
    const stageRows = orderChronologically(
      rows.filter((r) => r.field_key === 'stage_id'),
    )

    for (const row of stageRows) {
      const from = stageById.get(Number(row.old_value))
      const to = stageById.get(Number(row.new_value))

      // Ignore hops where an endpoint is unknown (deleted stage) or the two
      // stages live in different pipelines (order_nr is not comparable).
      if (from == null || to == null) continue
      if (from.pipeline_id !== to.pipeline_id) continue
      if (from.order_nr === to.order_nr) continue

      const finding = {
        dealId,
        kind: to.order_nr > from.order_nr ? 'skip' : 'backward',
        from: { stageId: from.id, name: from.name, order: from.order_nr },
        to: { stageId: to.id, name: to.name, order: to.order_nr },
        skipped: gatesBetween(
          orderedByPipeline.get(from.pipeline_id),
          from,
          to,
        ),
        actor_user_id: row.actor_user_id,
        time: row.time,
      }

      // A clean single-gate advance (order_nr + 1) is normal — not a finding.
      if (finding.kind === 'skip' && to.order_nr === from.order_nr + 1) continue

      findings.push(finding)
    }
  }

  return findings
}

/**
 * Names of the stages strictly between two stages by order_nr (forward only).
 * Backward moves skip no gates, so they return [].
 */
function gatesBetween(orderedStages, from, to) {
  if (to.order_nr <= from.order_nr) return []
  return orderedStages
    .filter((s) => s.order_nr > from.order_nr && s.order_nr < to.order_nr)
    .map((s) => s.name)
}

/**
 * Reorder stage_id transition rows oldest-first. Each finding is classified
 * from its OWN old/new order_nr, so this ordering is DISPLAY-ONLY and does not
 * affect which findings are produced or their kind — it only sorts the emitted
 * rows chronologically. The changelog is newest-first and the hops form a
 * chain, so order is recovered from the transition graph (start at the source
 * never seen as a destination, follow each old_value→new_value edge), with a
 * time-sort fallback when the graph is not a simple chain (a re-entered stage).
 */
function orderChronologically(stageRows) {
  if (stageRows.length <= 1) return stageRows

  const byTime = [...stageRows].sort((a, b) =>
    String(a.time ?? '').localeCompare(String(b.time ?? '')),
  )

  const destinations = new Set(stageRows.map((r) => String(r.new_value)))
  const starts = stageRows.filter((r) => !destinations.has(String(r.old_value)))
  // A clean chain has exactly one start node; anything else (a cycle from a
  // re-entered stage, or multiple disjoint segments) is ambiguous — defer to
  // the timestamp ordering.
  if (starts.length !== 1) return byTime

  const bySource = new Map(stageRows.map((r) => [String(r.old_value), r]))
  const chain = []
  let current = starts[0]
  const seen = new Set()
  while (current && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = bySource.get(String(current.new_value))
  }
  // If the walk did not consume every row (branch/cycle), trust the time sort.
  return chain.length === stageRows.length ? chain : byTime
}
