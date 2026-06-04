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
