import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class LeadDeleteCommand extends BaseCommand {
  static description = 'Delete a lead'

  static examples = [
    '<%= config.bin %> lead delete adf21080-0e10-11eb-879b-05d71fb426ec',
    '<%= config.bin %> lead delete adf21080-0e10-11eb-879b-05d71fb426ec --yes',
  ]

  static args = {
    id: Args.string({ required: true, description: 'Lead ID (UUID)' }),
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
    const { args, flags } = await this.parse(LeadDeleteCommand)

    const ok = await confirmAction(`Delete lead ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v1/leads/${args.id}`)
    this.log(chalk.green(`Deleted lead ${args.id}`))
  }
}
