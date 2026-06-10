import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { computeSlippage } from '../../lib/slippage.js'
import { mineMany } from '../../lib/changelog.js'
import { resolvePipeline } from '../../lib/pipelines.js'

export default class MetricsSlippageCommand extends BaseCommand {
  static description =
    'Close-date slippage: open deals whose expected close date keeps getting pushed out (mined per-deal changelog)'

  static examples = [
    '<%= config.bin %> metrics slippage',
    '<%= config.bin %> metrics slippage --pipeline 1',
    '<%= config.bin %> metrics slippage --min-pushes 2 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
    'min-pushes': Flags.integer({
      description: 'Only show deals pushed forward at least this many times',
      default: 1,
    }),
  }

  async run() {
    const { flags } = await this.parse(MetricsSlippageCommand)

    const pipelineId = await resolvePipeline(this.apiClient, flags.pipeline)

    // Pipeline scoping is done in the deals query itself, so no stages call is
    // needed. Each open deal then costs one changelog request (mineMany paces
    // and warns over 100 deals).
    const open = await collectPages(
      this.apiClient.pageV2('/api/v2/deals', {
        pipeline_id: pipelineId,
        status: 'open',
        limit: 500,
      }),
    )

    const transitionsByDeal = await mineMany(this.apiClient, open)
    const rows = computeSlippage(open, transitionsByDeal, {
      minPushes: flags['min-pushes'],
    })

    await this.outputResults(rows, {
      dealId: { header: 'Deal' },
      title: { header: 'Title' },
      ownerId: { header: 'Owner' },
      pushCount: { header: 'Pushes' },
      netDaysSlipped: { header: 'Net days slipped' },
      closeRange: {
        header: 'Close date',
        get: (row) => `${row.originalCloseDate} → ${row.currentCloseDate}`,
      },
    })
  }
}
