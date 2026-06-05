import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { buildWriteBody } from '../../../lib/input.js'
import { outputRecord } from '../../../lib/entity-view.js'
import { CliError } from '../../../lib/errors.js'

export default class DealProductUpdateCommand extends BaseCommand {
  static description =
    'Update a product attached to a deal (v2 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> deal product update 42 --attachment 3 --quantity 5',
    '<%= config.bin %> deal product update 42 --attachment 3 --price 120',
    '<%= config.bin %> deal product update 42 --attachment 3 --discount 15 --discount-type amount',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    attachment: Flags.integer({
      required: true,
      description: 'Deal-product (attachment) ID',
    }),
    product: Flags.integer({ description: 'Product ID' }),
    price: Flags.string({ description: 'Item price (per unit)' }),
    quantity: Flags.string({ description: 'Quantity' }),
    discount: Flags.string({ description: 'Discount value' }),
    'discount-type': Flags.string({
      description: 'Discount type',
      options: ['percentage', 'amount'],
    }),
    tax: Flags.string({ description: 'Product tax percentage' }),
    comments: Flags.string({ description: 'Comments' }),
  }

  async run() {
    const { args, flags } = await this.parse(DealProductUpdateCommand)

    const body = buildWriteBody({
      typed: {
        product_id: flags.product,
        item_price: flags.price !== undefined ? Number(flags.price) : undefined,
        quantity:
          flags.quantity !== undefined ? Number(flags.quantity) : undefined,
        discount:
          flags.discount !== undefined ? Number(flags.discount) : undefined,
        discount_type: flags['discount-type'],
        tax: flags.tax !== undefined ? Number(flags.tax) : undefined,
        comments: flags.comments,
      },
    })

    if (Object.keys(body).length === 0) {
      throw new CliError('Nothing to update — pass at least one field flag', {
        exitCode: 64,
      })
    }

    const res = await this.apiClient.patch(
      `/api/v2/deals/${args.id}/products/${flags.attachment}`,
      { body },
    )
    await outputRecord(this, res.data)
  }
}
