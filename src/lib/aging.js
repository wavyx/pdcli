const DAY_MS = 86_400_000

/**
 * Reconstruct an ordered list of stage entries for one deal from its raw
 * changelog rows. The changelog arrives newest-first and two hops can share
 * the same one-second timestamp, so neither raw order nor a plain time sort is
 * reliable. We sort by time ascending and then settle ties using the transition
 * graph (each row's old_value must chain from the previous row's new_value),
 * mirroring the start-stage derivation in computeExactFunnel.
 *
 * @param {object[]} rows raw changelog rows (field_key/old_value/new_value/time)
 * @returns {{ stageId: number, time: Date }[]} entries oldest-first; each is the
 *   moment the deal entered that stage. The deal's starting stage (the very
 *   first old_value) is NOT included — only entries we can timestamp.
 */
function stageEntries(rows) {
  const stageRows = rows.filter((r) => r.field_key === 'stage_id')
  if (stageRows.length === 0) return []

  // Primary key: time ascending. Tie-break by the graph so that, within the
  // same second, a row whose old_value matches the running "current" stage is
  // emitted before one that does not — keeping the chain monotonic.
  const remaining = [...stageRows].sort((a, b) =>
    String(a.time ?? '').localeCompare(String(b.time ?? '')),
  )

  // The starting stage = a source that never appears as a destination
  // (order-independent), falling back to the earliest row's source.
  const destinations = new Set(stageRows.map((r) => String(r.new_value)))
  const startSources = stageRows
    .map((r) => String(r.old_value))
    .filter((v) => !destinations.has(v))
  let current =
    startSources.length > 0 ? startSources[0] : String(remaining[0].old_value)

  const entries = []
  while (remaining.length > 0) {
    // Among the earliest-timestamp rows still pending, prefer the one that
    // continues the chain from `current`; else just take the earliest.
    const headTime = String(remaining[0].time ?? '')
    let idx = remaining.findIndex(
      (r) =>
        String(r.time ?? '') === headTime && String(r.old_value) === current,
    )
    if (idx === -1) idx = 0
    const [row] = remaining.splice(idx, 1)
    entries.push({ stageId: Number(row.new_value), time: new Date(row.time) })
    current = String(row.new_value)
  }
  return entries
}

/** Nearest-rank percentile of a numeric array (must be non-empty). */
function percentile(sorted, p) {
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.max(0, rank - 1)]
}

/**
 * Per-stage completed-dwell distribution mined from deals' changelog history.
 * A "completed dwell" is the time between entering a stage and entering the
 * next stage (entry[i] → entry[i+1]); the deal's current stage has no exit yet
 * so it contributes no completed dwell. Returns one row per stage (ordered by
 * order_nr): { stageId, stageName, count, p50, p90, maxDays }. When a stage has
 * no observed completed dwells, p50/p90/maxDays are null.
 *
 * @param {{ dealId: number, stageId: number, rows: object[] }[]} transitionsByDeal
 * @param {object[]} stages v2 stages (id, name, order_nr, pipeline_id)
 */
export function computeStageDwell(transitionsByDeal, stages) {
  const ordered = [...stages].sort((a, b) => a.order_nr - b.order_nr)
  const dwellsByStage = new Map(ordered.map((s) => [s.id, []]))

  for (const { rows } of transitionsByDeal) {
    const entries = stageEntries(rows)
    for (let i = 0; i < entries.length - 1; i++) {
      const days = (entries[i + 1].time - entries[i].time) / DAY_MS
      const bucket = dwellsByStage.get(entries[i].stageId)
      if (bucket) bucket.push(days)
    }
  }

  return ordered.map((stage) => {
    const dwells = dwellsByStage.get(stage.id).sort((a, b) => a - b)
    const has = dwells.length > 0
    return {
      stageId: stage.id,
      stageName: stage.name,
      count: dwells.length,
      p50: has ? percentile(dwells, 50) : null,
      p90: has ? percentile(dwells, 90) : null,
      maxDays: has ? dwells[dwells.length - 1] : null,
    }
  })
}

/**
 * Build bucket labels and their [lower, upper) bounds from threshold cuts.
 * buckets [30,60,90] → 0-30, 30-60, 60-90, 90+. Lower bound inclusive, upper
 * bound exclusive, so a deal at exactly 30 days lands in the 30-60 cohort.
 */
function bucketBounds(thresholds) {
  const cuts = [...thresholds].sort((a, b) => a - b)
  const bounds = []
  let prev = 0
  for (const cut of cuts) {
    bounds.push({ label: `${prev}-${cut}`, lower: prev, upper: cut })
    prev = cut
  }
  bounds.push({ label: `${prev}+`, lower: prev, upper: Infinity })
  return bounds
}

/**
 * Open-deal aging: for each open deal compute days-in-current-stage
 * (now − the LATEST entry into its current stage) and bucket it. The current
 * stage is the deal's stage_id; its entry time is the most recent stage_id
 * transition whose new_value equals that stage. A deal with no such entry has
 * an unknown dwell and is counted under `unknownCount` rather than bucketed.
 *
 * Each row also carries the stage's p90 dwell (from completed history) and how
 * many open deals in the stage exceed it.
 *
 * @param {object[]} openDeals open deals (id, stage_id, value)
 * @param {{ dealId: number, stageId: number, rows: object[] }[]} transitionsByDeal
 * @param {object[]} stages v2 stages (id, name, order_nr, pipeline_id)
 * @param {{ now: Date, buckets: number[] }} options
 */
export function computeAging(
  openDeals,
  transitionsByDeal,
  stages,
  { now, buckets },
) {
  const ordered = [...stages].sort((a, b) => a.order_nr - b.order_nr)
  const bounds = bucketBounds(buckets)
  const dwell = computeStageDwell(transitionsByDeal, stages)
  const p90ByStage = new Map(dwell.map((d) => [d.stageId, d.p90]))

  // Latest entry time into the deal's current stage, per deal.
  const latestEntry = new Map()
  for (const { dealId, stageId, rows } of transitionsByDeal) {
    const entries = stageEntries(rows)
    const intoCurrent = entries.filter((e) => e.stageId === stageId)
    if (intoCurrent.length > 0) {
      latestEntry.set(dealId, intoCurrent[intoCurrent.length - 1].time)
    }
  }

  return ordered.map((stage) => {
    const inStage = openDeals.filter((d) => d.stage_id === stage.id)
    const stageBuckets = {}
    for (const b of bounds) stageBuckets[b.label] = { count: 0, value: 0 }

    const p90 = p90ByStage.get(stage.id) ?? null
    let unknownCount = 0
    let p90ExceededCount = 0

    for (const deal of inStage) {
      const entry = latestEntry.get(deal.id)
      if (entry == null) {
        unknownCount++
        continue
      }
      const days = (now - entry) / DAY_MS
      const bucket = bounds.find((b) => days >= b.lower && days < b.upper)
      stageBuckets[bucket.label].count++
      stageBuckets[bucket.label].value += deal.value ?? 0
      if (p90 != null && days > p90) p90ExceededCount++
    }

    return {
      stage: stage.name,
      stageId: stage.id,
      buckets: stageBuckets,
      p90Days: p90,
      p90ExceededCount,
      unknownCount,
    }
  })
}
