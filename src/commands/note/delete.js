import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class NoteDeleteCommand extends BaseCommand {
  static description = 'Delete a note'

  static examples = [
    '<%= config.bin %> note delete 5',
    '<%= config.bin %> note delete 5 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Note ID' }),
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
    const { args, flags } = await this.parse(NoteDeleteCommand)

    const ok = await confirmAction(`Delete note ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v1/notes/${args.id}`)
    this.log(chalk.green(`Deleted note ${args.id}`))
  }
}
