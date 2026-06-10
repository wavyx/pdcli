import { closeMonthKey } from './period.js'

const DEFAULT_COMMIT_THRESHOLD = 70
const NO_DATE = 'no-date'
const NO_CURRENCY = '(none)'

/**
 * Time-phased pipeline forecast for open deals, bucketed by currency and the
 * deal's expected close-month. For each bucket three views are summed:
 *
 *   - bestCase: every open deal at full value (the optimistic ceiling)
 *   - commit:   full value of deals whose effective probability is at or above
 *               `commitThreshold` — the deals you are confident will close
 *   - weighted: each deal's value × its effective probability (risk-adjusted)
 *
 * Effective probability is the deal's own `probability` when set (0 is honored,
 * not treated as "unset"), else the stage's `deal_probability`, else 100 —
 * the same fallback chain computeHealth uses for its weighted value.
 *
 * Values are NEVER summed across currencies (a USD and an EUR deal are
 * different units): each currency is its own set of rows and its own totals
 * line, mirroring `deal summary`. A deal with no currency buckets under
 * "(none)"; one with no expected_close_date buckets under "no-date".
 *
 * @param {object[]} openDeals open deals (currency, value, probability,
 *   stage_id, expected_close_date)
 * @param {object[]} stages v2 stages (id, deal_probability)
 * @param {{ commitThreshold?: number }} [options]
 * @returns {{
 *   rows: { currency: string, month: string, dealCount: number,
 *     commit: number, bestCase: number, weighted: number }[],
 *   totals: { currency: string, dealCount: number, commit: number,
 *     bestCase: number, weighted: number }[],
 * }}
 */
export function computeForecast(openDeals, stages, { commitThreshold } = {}) {
  const threshold = commitThreshold ?? DEFAULT_COMMIT_THRESHOLD
  const stageProbById = new Map(stages.map((s) => [s.id, s.deal_probability]))

  // bucketsByCurrency: currency -> month -> aggregate
  const byCurrency = new Map()
  const ensure = (currency, month) => {
    if (!byCurrency.has(currency)) byCurrency.set(currency, new Map())
    const months = byCurrency.get(currency)
    if (!months.has(month)) {
      months.set(month, { dealCount: 0, commit: 0, bestCase: 0, weighted: 0 })
    }
    return months.get(month)
  }

  for (const deal of openDeals) {
    const currency = deal.currency ?? NO_CURRENCY
    const month = closeMonthKey(deal.expected_close_date) ?? NO_DATE
    const value = deal.value ?? 0
    const probability =
      deal.probability ?? stageProbById.get(deal.stage_id) ?? 100

    const bucket = ensure(currency, month)
    bucket.dealCount++
    bucket.bestCase += value
    bucket.weighted += (value * probability) / 100
    if (probability >= threshold) bucket.commit += value
  }

  // Month ordering: ascending YYYY-MM, with the no-date bucket pinned last.
  const monthRank = (m) => (m === NO_DATE ? '9999-99' : m)

  const rows = []
  const totals = []
  for (const currency of [...byCurrency.keys()].sort()) {
    const months = byCurrency.get(currency)
    const total = {
      currency,
      dealCount: 0,
      commit: 0,
      bestCase: 0,
      weighted: 0,
    }
    const sortedMonths = [...months.keys()].sort((a, b) =>
      monthRank(a).localeCompare(monthRank(b)),
    )
    for (const month of sortedMonths) {
      const b = months.get(month)
      rows.push({ currency, month, ...b })
      total.dealCount += b.dealCount
      total.commit += b.commit
      total.bestCase += b.bestCase
      total.weighted += b.weighted
    }
    totals.push(total)
  }

  return { rows, totals }
}
