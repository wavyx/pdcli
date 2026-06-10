import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { computeHealth, computeCoverage } from '../../lib/analytics.js'
import { fetchRevenueGoal } from '../../lib/goals.js'
import { resolvePipeline } from '../../lib/pipelines.js'

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

    const pipelineId = await resolvePipeline(this.apiClient, flags.pipeline)

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
        : await fetchRevenueGoal(this.apiClient, { period: flags.period, now })

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
