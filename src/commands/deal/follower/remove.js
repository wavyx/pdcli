import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../../base-command.js'
import { confirmAction } from '../../../lib/confirm.js'
import { CliError } from '../../../lib/errors.js'

export default class DealFollowerRemoveCommand extends BaseCommand {
  static description = 'Remove a follower from a deal'

  static examples = [
    '<%= config.bin %> deal follower remove 42 --user 5',
    '<%= config.bin %> deal follower remove 42 --user 5 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    user: Flags.integer({ required: true, description: 'User ID' }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(DealFollowerRemoveCommand)

    const ok = await confirmAction(
      `Remove follower ${flags.user} from deal ${args.id}?`,
      flags.yes,
      { default: false },
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v2/deals/${args.id}/followers/${flags.user}`)
    this.log(chalk.green(`Removed follower ${flags.user} from deal ${args.id}`))
  }
}
