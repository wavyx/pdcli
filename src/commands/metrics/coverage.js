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

    // Reuse computeHealth's probability weighting (deal prob > stage default >
    // 100%) and sum the per-stage weighted value into one open-pipeline figure.
    // Activities are irrelevant here, so pass an empty list.
    const weightedOpen = computeHealth(open, stages, [], { now }).reduce(
      (sum, row) => sum + row.weightedValue,
      0,
    )

    const { goalTarget, progress } =
      flags.target != null
        ? { goalTarget: flags.target, progress: 0 }
        : await this.#fetchRevenueGoal(flags.period, now)

    const coverage = computeCoverage({ weightedOpen, goalTarget, progress })

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
   * type and filter client-side on type.name or the sum tracking metric.
   * Targets and progress are summed across all matching goals.
   * @param {string} period
   * @param {Date} now
   */
  async #fetchRevenueGoal(period, now) {
    const periodStart = toGoalDate(parsePeriod(period, now))
    const periodEnd = toGoalDate(now)

    const found = await this.apiClient.get('/api/v1/goals/find', {
      query: { 'period.start': periodStart, 'period.end': periodEnd },
    })

    const goals = (found.data?.goals ?? []).filter(
      (g) =>
        g.type?.name === 'revenue_forecast' ||
        g.expected_outcome?.tracking_metric === 'sum',
    )

    if (goals.length === 0) {
      throw new CliError(
        'No active revenue goal found — create one in Pipedrive or pass --target',
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

    await this.outputResults(
      [
        { metric: 'Weighted pipeline', value: money(coverage.weightedOpen) },
        { metric: 'Quota', value: money(coverage.goalTarget) },
        { metric: 'Progress', value: money(coverage.progress) },
        { metric: 'Remaining', value: money(coverage.remaining) },
        { metric: 'Coverage ratio', value: ratio },
        { metric: 'Verdict', value: coverage.verdict },
      ],
      { metric: { header: 'Metric' }, value: { header: 'Value' } },
    )
  }
}
