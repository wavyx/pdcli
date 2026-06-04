import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class ProductDeleteCommand extends BaseCommand {
  static description = 'Delete a product'

  static examples = [
    '<%= config.bin %> product delete 7',
    '<%= config.bin %> product delete 7 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Product ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(ProductDeleteCommand)

    const ok = await confirmAction(`Delete product ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v2/products/${args.id}`)
    this.log(chalk.green(`Deleted product ${args.id}`))
  }
}
