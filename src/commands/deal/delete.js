import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class DealDeleteCommand extends BaseCommand {
  static description = 'Delete a deal'

  static examples = [
    '<%= config.bin %> deal delete 42',
    '<%= config.bin %> deal delete 42 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
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
    const { args, flags } = await this.parse(DealDeleteCommand)

    const ok = await confirmAction(`Delete deal ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v2/deals/${args.id}`)
    this.log(chalk.green(`Deleted deal ${args.id}`))
  }
}
