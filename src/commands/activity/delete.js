import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class ActivityDeleteCommand extends BaseCommand {
  static description = 'Delete an activity'

  static examples = [
    '<%= config.bin %> activity delete 9',
    '<%= config.bin %> activity delete 9 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Activity ID' }),
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
    const { args, flags } = await this.parse(ActivityDeleteCommand)

    const ok = await confirmAction(`Delete activity ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v2/activities/${args.id}`)
    await this.outputAction(
      { id: args.id, deleted: true },
      chalk.green(`Deleted activity ${args.id}`),
    )
  }
}
