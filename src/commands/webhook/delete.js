import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class WebhookDeleteCommand extends BaseCommand {
  static description = 'Delete a webhook'

  static examples = [
    '<%= config.bin %> webhook delete 3',
    '<%= config.bin %> webhook delete 3 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Webhook ID' }),
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
    const { args, flags } = await this.parse(WebhookDeleteCommand)

    const ok = await confirmAction(`Delete webhook ${args.id}?`, flags.yes)
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v1/webhooks/${args.id}`)
    await this.outputAction(
      { id: args.id, deleted: true },
      chalk.green(`Deleted webhook ${args.id}`),
    )
  }
}
