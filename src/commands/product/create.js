import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'

export default class ProductCreateCommand extends BaseCommand {
  static description = 'Create a product'

  static examples = [
    '<%= config.bin %> product create --name "Widget" --code W-1 --price 9.99 --currency EUR',
    '<%= config.bin %> product create --name "Sized" --field "Material=Steel"',
    '<%= config.bin %> product create --name "Raw" --body \'{"tax":19}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ required: true, description: 'Product name' }),
    code: Flags.string({ description: 'Product code (SKU)' }),
    unit: Flags.string({ description: 'Unit of measure' }),
    description: Flags.string({ description: 'Product description' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    price: Flags.string({
      description: 'Unit price (requires --currency)',
      dependsOn: ['currency'],
    }),
    currency: Flags.string({
      description: 'Price currency (requires --price)',
      dependsOn: ['price'],
    }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { flags } = await this.parse(ProductCreateCommand)

    const prices =
      flags.price !== undefined && flags.currency !== undefined
        ? [{ price: Number(flags.price), currency: flags.currency }]
        : undefined

    const body = buildWriteBody({
      typed: {
        name: flags.name,
        code: flags.code,
        unit: flags.unit,
        description: flags.description,
        owner_id: flags.owner,
        prices,
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'product', flags.field),
    })

    const res = await this.apiClient.post('/api/v2/products', { body })
    await outputRecord(this, res.data, 'product')
  }
}
