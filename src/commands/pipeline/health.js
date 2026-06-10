import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { computeHealth } from '../../lib/analytics.js'
import { resolvePipeline } from '../../lib/pipelines.js'

export default class PipelineHealthCommand extends BaseCommand {
  static description =
    'Per-stage pipeline health: value, weighted value, stale deals, missing next steps'

  static examples = [
    '<%= config.bin %> pipeline health',
    '<%= config.bin %> pipeline health --pipeline 1',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
  }

  async run() {
    const { flags } = await this.parse(PipelineHealthCommand)
    const now = new Date()

    const pipelineId = await resolvePipeline(this.apiClient, flags.pipeline)

    const [stages, open, activities] = await Promise.all([
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
      collectPages(
        this.apiClient.pageV2('/api/v2/activities', {
          done: false,
          limit: 500,
        }),
      ),
    ])

    const rows = computeHealth(open, stages, activities, { now })

    await this.outputResults(rows, {
      stage: { header: 'Stage' },
      openCount: { header: 'Open' },
      openValue: { header: 'Value' },
      weightedValue: {
        header: 'Weighted',
        get: (row) => String(Math.round(row.weightedValue)),
      },
      staleCount: { header: 'Stale >14d' },
      noNextActivityCount: { header: 'No next step' },
      pastCloseCount: { header: 'Past close' },
    })
  }
}
