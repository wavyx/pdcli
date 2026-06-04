import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  pipeline_id: { header: 'Pipeline' },
  deal_probability: { header: 'Probability' },
  order_nr: { header: 'Order' },
}

export default class StageListCommand extends BaseCommand {
  static description = 'List stages'

  static examples = [
    '<%= config.bin %> stage list',
    '<%= config.bin %> stage list --pipeline 1 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({ description: 'Filter by pipeline ID' }),
  }

  async run() {
    const { flags } = await this.parse(StageListCommand)
    const limit = flags.limit ?? 100

    const query = {
      pipeline_id: flags.pipeline,
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/stages', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
