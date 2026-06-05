import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { buildWriteBody } from '../../../lib/input.js'
import { outputRecord } from '../../../lib/entity-view.js'

export default class DealProductAddCommand extends BaseCommand {
  static description = 'Attach a product to a deal'

  static examples = [
    '<%= config.bin %> deal product add 42 --product 10 --price 90',
    '<%= config.bin %> deal product add 42 --product 10 --price 90 --quantity 3',
    '<%= config.bin %> deal product add 42 --product 10 --price 90 --discount 10 --discount-type percentage',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    product: Flags.integer({ required: true, description: 'Product ID' }),
    price: Flags.string({
      required: true,
      description: 'Item price (per unit)',
    }),
    quantity: Flags.string({ description: 'Quantity', default: '1' }),
    discount: Flags.string({ description: 'Discount value' }),
    'discount-type': Flags.string({
      description: 'Discount type',
      options: ['percentage', 'amount'],
    }),
    tax: Flags.string({ description: 'Product tax percentage' }),
    comments: Flags.string({ description: 'Comments' }),
  }

  async run() {
    const { args, flags } = await this.parse(DealProductAddCommand)

    const body = buildWriteBody({
      typed: {
        product_id: flags.product,
        item_price: Number(flags.price),
        quantity: Number(flags.quantity),
        discount:
          flags.discount !== undefined ? Number(flags.discount) : undefined,
        discount_type: flags['discount-type'],
        tax: flags.tax !== undefined ? Number(flags.tax) : undefined,
        comments: flags.comments,
      },
    })

    const res = await this.apiClient.post(`/api/v2/deals/${args.id}/products`, {
      body,
    })
    await outputRecord(this, res.data)
  }
}
