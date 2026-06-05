const DAY_MS = 86_400_000

/**
 * Sales Velocity Equation over a trailing window:
 * (open opportunities × win rate × avg won value) / avg cycle days.
 * Win rate uses the decided-deals variant: won / (won + lost) closed in
 * the window, keyed on won_time/lost_time. Cycle = won_time − add_time.
 * @param {object[]} deals open + closed deals (closed filtered to window here)
 * @param {{ since: Date, now: Date }} window
 */
export function computeVelocity(deals, { since }) {
  const open = deals.filter((d) => d.status === 'open')
  const wonInPeriod = deals.filter(
    (d) => d.status === 'won' && inWindow(d.won_time, since),
  )
  const lostInPeriod = deals.filter(
    (d) => d.status === 'lost' && inWindow(d.lost_time, since),
  )

  const decided = wonInPeriod.length + lostInPeriod.length
  const winRate = decided > 0 ? wonInPeriod.length / decided : null

  const wonValues = wonInPeriod.map((d) => d.value ?? 0)
  const avgWonValue =
    wonInPeriod.length > 0
      ? wonValues.reduce((a, b) => a + b, 0) / wonInPeriod.length
      : null

  const cycles = wonInPeriod.map(
    (d) => (new Date(d.won_time) - new Date(d.add_time)) / DAY_MS,
  )
  const avgCycleDays =
    cycles.length > 0 ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null

  const velocityPerDay =
    winRate != null && avgWonValue != null && avgCycleDays > 0
      ? (open.length * winRate * avgWonValue) / avgCycleDays
      : null

  return {
    openCount: open.length,
    wonCount: wonInPeriod.length,
    lostCount: lostInPeriod.length,
    winRate,
    avgWonValue,
    avgCycleDays,
    velocityPerDay,
  }
}

function inWindow(time, since) {
  return time != null && new Date(time) >= since
}

/**
 * Stage-reach funnel approximated from closed deals' final stages: a deal
 * counts as having reached every stage up to (and including) its final one;
 * won deals count for every stage. Accurate per-stage history would need
 * per-deal flow mining (v1) — this stays one cheap list call.
 * @param {object[]} closedDeals won/lost deals (already window-filtered)
 * @param {object[]} openDeals current open deals
 * @param {object[]} stages v2 stages (order_nr, pipeline_id)
 * @param {{ pipelineId?: number }} [options]
 */
export function computeFunnel(closedDeals, openDeals, stages, options = {}) {
  const ordered = stages
    .filter(
      (s) => options.pipelineId == null || s.pipeline_id === options.pipelineId,
    )
    .sort((a, b) => a.order_nr - b.order_nr)

  const orderByStageId = new Map(ordered.map((s, i) => [s.id, i]))

  function finalIndex(deal) {
    if (deal.status === 'won') return ordered.length - 1
    return orderByStageId.get(deal.stage_id) ?? -1
  }

  return ordered.map((stage, index) => {
    const reached = closedDeals.filter((d) => finalIndex(d) >= index).length
    const openHere = openDeals.filter((d) => d.stage_id === stage.id)
    const prevReached =
      index > 0
        ? closedDeals.filter((d) => finalIndex(d) >= index - 1).length
        : null

    return {
      stage: stage.name,
      stageId: stage.id,
      reached,
      conversionFromPrev:
        index > 0 && prevReached > 0 ? reached / prevReached : null,
      openCount: openHere.length,
      openValue: openHere.reduce((sum, d) => sum + (d.value ?? 0), 0),
    }
  })
}

/**
 * EXACT stage funnel mined from per-deal changelog history, rather than the
 * final-stage approximation in computeFunnel. A deal "enters" a stage when it
 * is observed there: every `new_value` of a stage_id transition, plus the
 * deal's starting stage (the first transition's `old_value`, or the deal's
 * current stage when it has no stage transitions — i.e. it was created
 * directly in that stage). Skipped stages are NOT counted (the whole point):
 * a deal that jumps 1→3 enters 1 and 3 only, never 2. Entries are de-duped per
 * deal, so re-entering a stage still counts once. `won` counts deals whose
 * changelog has a status transition to "won".
 *
 * @param {{ dealId: number, stageId: number, rows: object[] }[]} transitionsByDeal
 *   one entry per mined deal: its current stage_id and raw changelog rows
 *   (each row: { field_key, old_value, new_value } — values stringified).
 * @param {object[]} stages v2 stages (order_nr, pipeline_id)
 * @param {{ pipelineId?: number }} [options]
 */
export function computeExactFunnel(transitionsByDeal, stages, options = {}) {
  const ordered = stages
    .filter(
      (s) => options.pipelineId == null || s.pipeline_id === options.pipelineId,
    )
    .sort((a, b) => a.order_nr - b.order_nr)

  const validStageId = new Set(ordered.map((s) => s.id))
  // distinct deals entered per stage id
  const enteredByStage = new Map(ordered.map((s) => [s.id, new Set()]))
  let won = 0

  for (const { dealId, stageId, rows } of transitionsByDeal) {
    const stageRows = rows.filter((r) => r.field_key === 'stage_id')
    const entered = new Set()

    // Starting stage: derived from the transition graph — the source stage
    // that never appears as a destination. Order-independent, so it is
    // immune to the changelog's newest-first ordering AND to two hops
    // sharing the same one-second timestamp. Falls back to the oldest row's
    // source (time sort) for degenerate cycles, else the current stage.
    const destinations = new Set(stageRows.map((r) => String(r.new_value)))
    const startSources = stageRows
      .map((r) => String(r.old_value))
      .filter((v) => !destinations.has(v))
    let startStage
    if (startSources.length > 0) {
      startStage = Number(startSources[0])
    } else if (stageRows.length > 0) {
      const oldest = [...stageRows].sort((a, b) =>
        String(a.time ?? '').localeCompare(String(b.time ?? '')),
      )[0]
      startStage = Number(oldest.old_value)
    } else {
      startStage = stageId
    }
    entered.add(startStage)
    for (const r of stageRows) entered.add(Number(r.new_value))

    for (const id of entered) {
      if (validStageId.has(id)) enteredByStage.get(id).add(dealId)
    }

    if (rows.some((r) => r.field_key === 'status' && r.new_value === 'won')) {
      won++
    }
  }

  const resultRows = ordered.map((stage, index) => {
    const entered = enteredByStage.get(stage.id).size
    const prevEntered =
      index > 0 ? enteredByStage.get(ordered[index - 1].id).size : null

    return {
      stage: stage.name,
      stageId: stage.id,
      entered,
      conversionFromPrev:
        index > 0 && prevEntered > 0 ? entered / prevEntered : null,
    }
  })

  // `won` is a single account-wide total — returned once, not repeated on
  // every row, so JSON consumers don't misread it as a per-stage figure.
  return { rows: resultRows, won }
}

const STALE_DAYS = 14

/**
 * Per-stage pipeline health snapshot: open count/value, probability-weighted
 * value (deal probability wins over stage default), stale deals (>14 days
 * without update), deals without a future open activity, and deals past
 * their expected close date.
 * @param {object[]} deals open deals
 * @param {object[]} stages
 * @param {object[]} activities open+done activities for those deals
 * @param {{ now: Date }} options
 */
export function computeHealth(deals, stages, activities, { now }) {
  const open = deals.filter((d) => d.status === 'open')
  const today = now.toISOString().slice(0, 10)

  const dealsWithFutureActivity = new Set(
    activities
      .filter((a) => !a.done && a.due_date >= today && a.deal_id != null)
      .map((a) => a.deal_id),
  )

  const ordered = [...stages].sort((a, b) => a.order_nr - b.order_nr)

  return ordered.map((stage) => {
    const inStage = open.filter((d) => d.stage_id === stage.id)

    const weightedValue = inStage.reduce((sum, d) => {
      const probability = d.probability ?? stage.deal_probability ?? 100
      return sum + ((d.value ?? 0) * probability) / 100
    }, 0)

    const staleCount = inStage.filter(
      (d) => now - new Date(d.update_time) > STALE_DAYS * DAY_MS,
    ).length

    const noNextActivityCount = inStage.filter(
      (d) => !dealsWithFutureActivity.has(d.id),
    ).length

    const pastCloseCount = inStage.filter(
      (d) => d.expected_close_date != null && d.expected_close_date < today,
    ).length

    return {
      stage: stage.name,
      stageId: stage.id,
      openCount: inStage.length,
      openValue: inStage.reduce((sum, d) => sum + (d.value ?? 0), 0),
      weightedValue,
      staleCount,
      noNextActivityCount,
      pastCloseCount,
    }
  })
}

/** Rule-of-thumb pipeline-coverage thresholds (raw open ÷ remaining gap). */
const COVERAGE_HEALTHY = 3
const COVERAGE_BORDERLINE = 2

/**
 * Pipeline coverage against a revenue quota. The classic 3x rule of thumb is
 * defined on RAW pipeline value — weighting it by win probability first would
 * double-discount risk — so `coverage` = openValue ÷ remaining and drives the
 * verdict; `weightedCoverage` = weightedOpen ÷ remaining is reported as the
 * risk-adjusted secondary view. remaining = max(target − progress, 0).
 *
 * When progress already meets/exceeds the target the gap clamps to 0 — there
 * is nothing left to cover, so the ratios are `null` (not Infinity, which is
 * not JSON-serializable) with verdict `'covered'`.
 * @param {{ openValue: number, weightedOpen: number, goalTarget: number,
 *   progress?: number }} input
 */
export function computeCoverage({
  openValue,
  weightedOpen,
  goalTarget,
  progress = 0,
}) {
  const remaining = Math.max(goalTarget - progress, 0)

  if (remaining === 0) {
    return {
      openValue,
      weightedOpen,
      goalTarget,
      progress,
      remaining,
      coverage: null,
      weightedCoverage: null,
      verdict: 'covered',
    }
  }

  const coverage = openValue / remaining
  const verdict =
    coverage >= COVERAGE_HEALTHY
      ? 'healthy'
      : coverage >= COVERAGE_BORDERLINE
        ? 'borderline'
        : 'low'

  return {
    openValue,
    weightedOpen,
    goalTarget,
    progress,
    remaining,
    coverage,
    weightedCoverage: weightedOpen / remaining,
    verdict,
  }
}
