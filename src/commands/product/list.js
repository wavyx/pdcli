import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  code: { header: 'Code' },
  unit: { header: 'Unit' },
  price: {
    header: 'Price',
    get: (row) =>
      row.prices?.[0] ? `${row.prices[0].price} ${row.prices[0].currency}` : '',
  },
}

export default class ProductListCommand extends BaseCommand {
  static description = 'List products'

  static examples = [
    '<%= config.bin %> product list',
    '<%= config.bin %> product list --owner 3 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    owner: Flags.integer({ description: 'Filter by owner (user) ID' }),
  }

  async run() {
    const { flags } = await this.parse(ProductListCommand)
    const limit = flags.limit ?? 100

    const query = {
      owner_id: flags.owner,
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/products', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
