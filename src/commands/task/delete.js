import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class TaskDeleteCommand extends BaseCommand {
  static description = 'Delete a task'

  static examples = [
    '<%= config.bin %> task delete 7',
    '<%= config.bin %> task delete 7 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Task ID' }),
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
    const { args, flags } = await this.parse(TaskDeleteCommand)

    const ok = await confirmAction(`Delete task ${args.id}?`, flags.yes, {
      default: false,
    })
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v2/tasks/${args.id}`)
    this.log(chalk.green(`Deleted task ${args.id}`))
  }
}
