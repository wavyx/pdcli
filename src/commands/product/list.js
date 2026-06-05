import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { CliError } from '../../lib/errors.js'

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
    filter: Flags.integer({ description: 'Filter by saved filter ID' }),
    ids: Flags.string({
      description: 'Comma-separated IDs to fetch (max 100)',
      // The API silently drops `ids` when filter_id is present — refuse
      // the combination instead (matches deal bulk-update).
      exclusive: ['filter'],
    }),
    'sort-by': Flags.string({
      description: 'Sort field',
      options: ['id', 'name', 'add_time', 'update_time'],
    }),
    'sort-direction': Flags.string({
      description: 'Sort direction',
      options: ['asc', 'desc'],
    }),
    'updated-since': Flags.string({
      description:
        'Only items updated at/after this RFC3339 time (no fractional seconds)',
    }),
  }

  async run() {
    const { flags } = await this.parse(ProductListCommand)
    const limit = flags.limit ?? 500

    const idList = flags.ids
      ?.split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (idList && idList.length > 100) {
      throw new CliError('--ids accepts at most 100 IDs', { exitCode: 64 })
    }

    const query = {
      owner_id: flags.owner,
      filter_id: flags.filter,
      ids: idList?.join(','),
      sort_by: flags['sort-by'],
      sort_direction: flags['sort-direction'],
      updated_since: flags['updated-since'],
      limit: Math.min(limit, 500),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/products', query),
      limit,
    )
    await this.outputResults(items, columns, { entity: 'product' })
  }
}
