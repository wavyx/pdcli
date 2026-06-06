import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../../base-command.js'
import { confirmAction } from '../../../lib/confirm.js'
import { CliError } from '../../../lib/errors.js'

export default class DealParticipantRemoveCommand extends BaseCommand {
  static description = 'Remove a participant from a deal'

  static examples = [
    '<%= config.bin %> deal participant remove 42 --participant 3',
    '<%= config.bin %> deal participant remove 42 --participant 3 --yes',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    participant: Flags.integer({
      required: true,
      description: 'Deal-participant ID',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(DealParticipantRemoveCommand)

    const ok = await confirmAction(
      `Remove participant ${flags.participant} from deal ${args.id}?`,
      flags.yes,
      { default: false },
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(
      `/api/v1/deals/${args.id}/participants/${flags.participant}`,
    )
    this.log(
      chalk.green(
        `Removed participant ${flags.participant} from deal ${args.id}`,
      ),
    )
  }
}
