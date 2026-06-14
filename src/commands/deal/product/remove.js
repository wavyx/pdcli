import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../../base-command.js'
import { confirmAction } from '../../../lib/confirm.js'
import { CliError } from '../../../lib/errors.js'

export default class DealProductRemoveCommand extends BaseCommand {
  static description = 'Remove a product attached to a deal'

  static examples = [
    '<%= config.bin %> deal product remove 42 --attachment 3',
    '<%= config.bin %> deal product remove 42 --attachment 3 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    attachment: Flags.integer({
      required: true,
      description: 'Deal-product (attachment) ID',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(DealProductRemoveCommand)

    const ok = await confirmAction(
      `Remove product attachment ${flags.attachment} from deal ${args.id}?`,
      flags.yes,
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(
      `/api/v2/deals/${args.id}/products/${flags.attachment}`,
    )
    await this.outputAction(
      { id: args.id, attachment_id: flags.attachment, removed: true },
      chalk.green(
        `Removed product attachment ${flags.attachment} from deal ${args.id}`,
      ),
    )
  }
}
