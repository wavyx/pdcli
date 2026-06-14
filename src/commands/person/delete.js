import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class PersonDeleteCommand extends BaseCommand {
  static description = 'Delete a person'

  static examples = [
    '<%= config.bin %> person delete 42',
    '<%= config.bin %> person delete 42 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Person ID' }),
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
    const { args, flags } = await this.parse(PersonDeleteCommand)

    const ok = await confirmAction(`Delete person ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v2/persons/${args.id}`)
    await this.outputAction(
      { id: args.id, deleted: true },
      chalk.green(`Deleted person ${args.id}`),
    )
  }
}
