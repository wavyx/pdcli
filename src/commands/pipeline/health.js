import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { computeHealth } from '../../lib/analytics.js'
import { CliError } from '../../lib/errors.js'

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

    let pipelineId = flags.pipeline
    if (pipelineId == null) {
      const body = await this.apiClient.get('/api/v2/pipelines')
      const pipelines = body.data ?? []
      if (pipelines.length > 1) {
        throw new CliError(
          `Account has ${pipelines.length} pipelines — pass --pipeline <id> ` +
            `(${pipelines.map((p) => `${p.id}=${p.name}`).join(', ')})`,
          { exitCode: 64 },
        )
      }
      pipelineId = pipelines[0]?.id
    }

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
