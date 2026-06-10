import { CliError } from './errors.js'
import { parsePeriod } from './period.js'

/** YYYY-MM-DD — the date format the Goals API period params expect. */
function toGoalDate(date) {
  return date.toISOString().slice(0, 10)
}

/** Normalize a goal type name for comparison: lowercased, spaces→underscores. */
export function normalizeGoalType(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * Known non-revenue goal type names. A `sum` tracking metric on one of these
 * (e.g. a deals_won value goal) must not silently join the revenue quota.
 */
export const NON_REVENUE_TYPES = new Set([
  'deals_won',
  'deals_progressed',
  'deals_started',
  'activities_completed',
  'activities_added',
])

/**
 * Find the active revenue goal(s) via the v1 Goals API and read their
 * progress. The find enum has no `revenue_forecast`, so query without a type
 * and filter client-side. Prefer goals whose type normalizes to
 * `revenue_forecast`; otherwise fall back to `sum` goals that are not a known
 * non-revenue type (so a deals_won sum goal does not silently join the quota).
 * A lone non-revenue sum goal is used as a last resort with a stderr note.
 * Targets/progress are summed across matched goals, which must share a single
 * currency (a goal without a currency_id is its own bucket).
 *
 * @param {{ get: (path: string, opts?: object) => Promise<object> }} client
 * @param {{ period: string, now: Date }} options
 * @returns {Promise<{ goalTarget: number, progress: number }>}
 */
export async function fetchRevenueGoal(client, { period, now }) {
  const periodStart = toGoalDate(parsePeriod(period, now))
  const periodEnd = toGoalDate(now)

  const found = await client.get('/api/v1/goals/find', {
    query: { 'period.start': periodStart, 'period.end': periodEnd },
  })

  const allGoals = found.data?.goals ?? []

  // True revenue goals: type name normalizes to revenue_forecast.
  const revenueGoals = allGoals.filter(
    (g) => normalizeGoalType(g.type?.name) === 'revenue_forecast',
  )
  // Fallback: value (`sum`) goals whose type is NOT a known non-revenue type.
  // A deals_won sum goal must not silently join the revenue quota.
  const fallbackGoals = allGoals.filter(
    (g) =>
      g.expected_outcome?.tracking_metric === 'sum' &&
      normalizeGoalType(g.type?.name) !== 'revenue_forecast' &&
      !NON_REVENUE_TYPES.has(normalizeGoalType(g.type?.name)),
  )

  let goals = revenueGoals.length > 0 ? revenueGoals : fallbackGoals

  // If nothing matched even loosely, fall back to any sum goal so a lone
  // deals_won value goal can still serve as the quota — but flag what we used.
  if (goals.length === 0) {
    const sumGoals = allGoals.filter(
      (g) => g.expected_outcome?.tracking_metric === 'sum',
    )
    if (sumGoals.length > 0) {
      const types = [
        ...new Set(sumGoals.map((g) => normalizeGoalType(g.type?.name))),
      ].join(', ')
      process.stderr.write(
        `Note: no revenue_forecast goal found; using sum goal(s) of type ` +
          `'${types}' as the quota.\n`,
      )
      goals = sumGoals
    }
  }

  if (goals.length === 0) {
    throw new CliError(
      'No active revenue goal found — create one in Pipedrive or pass --target',
      { exitCode: 64 },
    )
  }

  // Cannot sum targets/progress across mixed currencies. A goal without a
  // currency_id is its own bucket — mixing it with a real currency is just as
  // unsumable as mixing two real ones.
  const currencyIds = [
    ...new Set(goals.map((g) => g.expected_outcome?.currency_id ?? 'none')),
  ]
  if (currencyIds.length > 1) {
    throw new CliError(
      `Goals use multiple currencies (ids: ${currencyIds.join(', ')}) — ` +
        `coverage cannot mix them; pass --target to set a single quota.`,
      { exitCode: 64 },
    )
  }

  const goalTarget = goals.reduce(
    (sum, g) => sum + (g.expected_outcome?.target ?? 0),
    0,
  )

  const results = await Promise.all(
    goals.map((g) =>
      client.get(`/api/v1/goals/${g.id}/results`, {
        query: { 'period.start': periodStart, 'period.end': periodEnd },
      }),
    ),
  )
  const progress = results.reduce((sum, r) => sum + (r.data?.progress ?? 0), 0)

  return { goalTarget, progress }
}
