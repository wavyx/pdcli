import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class ProductGetCommand extends BaseCommand {
  static description = 'Get a product by ID'

  static examples = [
    '<%= config.bin %> product get 7',
    '<%= config.bin %> product get 7 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Product ID' }),
  }

  async run() {
    const { args } = await this.parse(ProductGetCommand)
    const body = await this.apiClient.get(`/api/v2/products/${args.id}`)
    await outputRecord(this, body.data, 'product')
  }
}
