import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  is_deal_probability_enabled: { header: 'Probability' },
  order_nr: { header: 'Order' },
}

export default class PipelineListCommand extends BaseCommand {
  static description = 'List pipelines'

  static examples = [
    '<%= config.bin %> pipeline list',
    '<%= config.bin %> pipeline list --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { flags } = await this.parse(PipelineListCommand)
    const limit = flags.limit ?? 100

    const query = {
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/pipelines', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
