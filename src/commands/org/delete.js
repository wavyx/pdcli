import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class OrgDeleteCommand extends BaseCommand {
  static description = 'Delete an organization'

  static examples = [
    '<%= config.bin %> org delete 7',
    '<%= config.bin %> org delete 7 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Organization ID' }),
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
    const { args, flags } = await this.parse(OrgDeleteCommand)

    const ok = await confirmAction(`Delete organization ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v2/organizations/${args.id}`)
    await this.outputAction(
      { id: args.id, deleted: true },
      chalk.green(`Deleted organization ${args.id}`),
    )
  }
}
