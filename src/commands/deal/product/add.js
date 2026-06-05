import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { CliError } from '../../../lib/errors.js'
import { buildWriteBody } from '../../../lib/input.js'
import { outputRecord } from '../../../lib/entity-view.js'

/** Coerce a numeric flag, failing with a clean input error on garbage. */
function num(name, value) {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new CliError(`Invalid number for --${name}: "${value}"`, {
      exitCode: 64,
    })
  }
  return n
}

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
        item_price: num('price', flags.price),
        quantity: num('quantity', flags.quantity),
        discount: num('discount', flags.discount),
        discount_type: flags['discount-type'],
        tax: num('tax', flags.tax),
        comments: flags.comments,
      },
    })

    const res = await this.apiClient.post(`/api/v2/deals/${args.id}/products`, {
      body,
    })
    await outputRecord(this, res.data)
  }
}
