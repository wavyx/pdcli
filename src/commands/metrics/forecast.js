import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { computeForecast } from '../../lib/forecast.js'
import { resolvePipeline } from '../../lib/pipelines.js'

export default class MetricsForecastCommand extends BaseCommand {
  static description =
    'Time-phased forecast: open pipeline bucketed by close-month into ' +
    'commit / best-case / weighted views, segregated per currency'

  static examples = [
    '<%= config.bin %> metrics forecast',
    '<%= config.bin %> metrics forecast --pipeline 1',
    '<%= config.bin %> metrics forecast --commit-threshold 80 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
    'commit-threshold': Flags.integer({
      description:
        'Min effective win-probability (%) for a deal to count toward commit',
      default: 70,
    }),
  }

  async run() {
    const { flags } = await this.parse(MetricsForecastCommand)
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

    const forecast = computeForecast(open, stages, {
      commitThreshold: flags['commit-threshold'],
    })

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(forecast, {})
      return
    }

    const money = (key) => (row) => String(Math.round(row[key]))
    const valueColumns = {
      commit: { header: 'Commit', get: money('commit') },
      bestCase: { header: 'Best case', get: money('bestCase') },
      weighted: { header: 'Weighted', get: money('weighted') },
    }

    await this.outputResults(forecast.rows, {
      currency: { header: 'Cur' },
      month: { header: 'Month' },
      dealCount: { header: 'Deals' },
      ...valueColumns,
    })

    if (forecast.totals.length > 0) {
      this.log('')
      this.log('Totals by currency:')
      await this.outputResults(forecast.totals, {
        currency: { header: 'Cur' },
        dealCount: { header: 'Deals' },
        ...valueColumns,
      })
    }
  }
}
