import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { collectPages } from '../../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  product_id: { header: 'Product' },
  name: { header: 'Name' },
  item_price: { header: 'Item price' },
  quantity: { header: 'Qty' },
  discount: { header: 'Discount' },
  sum: { header: 'Sum' },
}

export default class DealProductListCommand extends BaseCommand {
  static description = 'List products attached to a deal'

  static examples = [
    '<%= config.bin %> deal product list 42',
    '<%= config.bin %> deal product list 42 --sort-by add_time --sort-direction desc',
    '<%= config.bin %> deal product list 42 --output json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    'sort-by': Flags.string({
      description: 'Field to sort by',
      options: ['id', 'add_time', 'update_time', 'order_nr'],
    }),
    'sort-direction': Flags.string({
      description: 'Sort direction',
      options: ['asc', 'desc'],
    }),
  }

  async run() {
    const { args, flags } = await this.parse(DealProductListCommand)
    const limit = flags.limit ?? 500

    const query = {
      sort_by: flags['sort-by'],
      sort_direction: flags['sort-direction'],
      limit: Math.min(limit, 500),
    }

    const items = await collectPages(
      this.apiClient.pageV2(`/api/v2/deals/${args.id}/products`, query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
