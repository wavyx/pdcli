import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class FilterDeleteCommand extends BaseCommand {
  static description = 'Delete a filter'

  static examples = [
    '<%= config.bin %> filter delete 5',
    '<%= config.bin %> filter delete 5 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Filter ID' }),
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
    const { args, flags } = await this.parse(FilterDeleteCommand)

    const ok = await confirmAction(`Delete filter ${args.id}?`, flags.yes, {
      default: false,
    })
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v1/filters/${args.id}`)
    await this.outputAction(
      { id: args.id, deleted: true },
      chalk.green(`Deleted filter ${args.id}`),
    )
  }
}
