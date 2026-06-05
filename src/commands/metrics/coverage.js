import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { parsePeriod } from '../../lib/period.js'
import { computeHealth, computeCoverage } from '../../lib/analytics.js'
import { CliError } from '../../lib/errors.js'

/** YYYY-MM-DD — the date format the Goals API period params expect. */
function toGoalDate(date) {
  return date.toISOString().slice(0, 10)
}

/** Normalize a goal type name for comparison: lowercased, spaces→underscores. */
function normalizeGoalType(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * Known non-revenue goal type names. A `sum` tracking metric on one of these
 * (e.g. a deals_won value goal) must not silently join the revenue quota.
 */
const NON_REVENUE_TYPES = new Set([
  'deals_won',
  'deals_progressed',
  'deals_started',
  'activities_completed',
  'activities_added',
])

export default class MetricsCoverageCommand extends BaseCommand {
  static description =
    'Pipeline coverage: probability-weighted open pipeline vs the revenue still needed to hit quota'

  static examples = [
    '<%= config.bin %> metrics coverage',
    '<%= config.bin %> metrics coverage --pipeline 1',
    '<%= config.bin %> metrics coverage --target 250000',
    '<%= config.bin %> metrics coverage --period 1m --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
    period: Flags.string({
      description: 'Goal measurement window (Nd or Nm)',
      default: '90d',
    }),
    target: Flags.integer({
      description:
        'Manual revenue quota override (skips the Goals API entirely)',
    }),
  }

  async run() {
    const { flags } = await this.parse(MetricsCoverageCommand)
    const now = new Date()

    const pipelineId = await this.#resolvePipeline(flags.pipeline)

    const [stages, open] = await Promise.all([
      collectPages(
        this.apiClient.pageV2('/api/v2/stages', {
          pipeline_id: pipelineId,
          limit: 500,
        }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', {
          pipeline_id: pipelineId,
          status: 'open',
          limit: 500,
        }),
      ),
    ])

    // computeHealth gives both the raw open value (classic coverage input)
    // and the probability-weighted value (risk-adjusted secondary view).
    // Activities are irrelevant here, so pass an empty list.
    const healthRows = computeHealth(open, stages, [], { now })
    const openValue = healthRows.reduce((sum, row) => sum + row.openValue, 0)
    const weightedOpen = healthRows.reduce(
      (sum, row) => sum + row.weightedValue,
      0,
    )

    const { goalTarget, progress } =
      flags.target != null
        ? { goalTarget: flags.target, progress: 0 }
        : await this.#fetchRevenueGoal(flags.period, now)

    const coverage = computeCoverage({
      openValue,
      weightedOpen,
      goalTarget,
      progress,
    })

    if (this.resolveFormat() === 'table') {
      await this.#renderTable(coverage)
      return
    }

    await this.outputResults(coverage, {})
  }

  /**
   * Resolve the pipeline to report on: the explicit flag, else the only
   * pipeline in the account. Several pipelines without a flag is a usage error.
   * @param {number | undefined} flagPipeline
   */
  async #resolvePipeline(flagPipeline) {
    if (flagPipeline != null) return flagPipeline

    const body = await this.apiClient.get('/api/v2/pipelines')
    const pipelines = body.data ?? []
    if (pipelines.length > 1) {
      throw new CliError(
        `Account has ${pipelines.length} pipelines — pass --pipeline <id> ` +
          `(${pipelines.map((p) => `${p.id}=${p.name}`).join(', ')})`,
        { exitCode: 64 },
      )
    }
    return pipelines[0]?.id
  }

  /**
   * Find the active revenue goal(s) via the v1 Goals API and read their
   * progress. The find enum has no `revenue_forecast`, so query without a
   * type and filter client-side. Prefer goals whose type normalizes to
   * `revenue_forecast`; otherwise fall back to `sum` goals that are not a
   * known non-revenue type (so a deals_won sum goal does not silently join
   * the quota). A lone non-revenue sum goal is used as a last resort with a
   * stderr note. Targets/progress are summed across matched goals, which must
   * share a single currency.
   * @param {string} period
   * @param {Date} now
   */
  async #fetchRevenueGoal(period, now) {
    const periodStart = toGoalDate(parsePeriod(period, now))
    const periodEnd = toGoalDate(now)

    const found = await this.apiClient.get('/api/v1/goals/find', {
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

    // Coverage cannot sum targets/progress across mixed currencies.
    // A goal without a currency_id is its own bucket — mixing it with a
    // real currency is just as unsumable as mixing two real ones.
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
        this.apiClient.get(`/api/v1/goals/${g.id}/results`, {
          query: { 'period.start': periodStart, 'period.end': periodEnd },
        }),
      ),
    )
    const progress = results.reduce(
      (sum, r) => sum + (r.data?.progress ?? 0),
      0,
    )

    return { goalTarget, progress }
  }

  /** @param {ReturnType<typeof computeCoverage>} coverage */
  async #renderTable(coverage) {
    const money = (n) => String(Math.round(n))
    const ratio =
      coverage.coverage == null ? 'covered' : `${coverage.coverage.toFixed(1)}x`

    const weightedRatio =
      coverage.weightedCoverage == null
        ? 'covered'
        : `${coverage.weightedCoverage.toFixed(1)}x`

    await this.outputResults(
      [
        { metric: 'Open pipeline', value: money(coverage.openValue) },
        { metric: 'Weighted pipeline', value: money(coverage.weightedOpen) },
        { metric: 'Quota', value: money(coverage.goalTarget) },
        { metric: 'Progress', value: money(coverage.progress) },
        { metric: 'Remaining', value: money(coverage.remaining) },
        { metric: 'Coverage ratio', value: ratio },
        { metric: 'Weighted coverage', value: weightedRatio },
        { metric: 'Verdict', value: coverage.verdict },
      ],
      { metric: { header: 'Metric' }, value: { header: 'Value' } },
    )
  }
}
