import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class FileDeleteCommand extends BaseCommand {
  static description = 'Delete a file'

  static examples = [
    '<%= config.bin %> file delete 5',
    '<%= config.bin %> file delete 5 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'File ID' }),
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
    const { args, flags } = await this.parse(FileDeleteCommand)

    const ok = await confirmAction(`Delete file ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v1/files/${args.id}`)
    this.log(chalk.green(`Deleted file ${args.id}`))
  }
}
