import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class ProductUpdateCommand extends BaseCommand {
  static description =
    'Update a product (v2 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> product update 7 --name "New name"',
    '<%= config.bin %> product update 7 --price 12.50 --currency USD',
    '<%= config.bin %> product update 7 --field "Material=Steel"',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Product ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ description: 'Product name' }),
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
    const { args, flags } = await this.parse(ProductUpdateCommand)

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

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag, --field, or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.patch(`/api/v2/products/${args.id}`, {
      body,
    })
    await outputRecord(this, res.data, 'product')
  }
}
