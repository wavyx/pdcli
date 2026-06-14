import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../../base-command.js'
import { confirmAction } from '../../../lib/confirm.js'
import { CliError } from '../../../lib/errors.js'

export default class OrgRelationshipRemoveCommand extends BaseCommand {
  static description = 'Delete an organization relationship'

  static examples = [
    '<%= config.bin %> org relationship remove 7',
    '<%= config.bin %> org relationship remove 7 --yes',
  ]

  static args = {
    id: Args.integer({
      required: true,
      description: 'Organization relationship ID',
    }),
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
    const { args, flags } = await this.parse(OrgRelationshipRemoveCommand)

    const ok = await confirmAction(
      `Delete organization relationship ${args.id}?`,
      flags.yes,
      { default: false },
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`/api/v1/organizationRelationships/${args.id}`)
    await this.outputAction(
      { id: args.id, removed: true },
      chalk.green(`Deleted organization relationship ${args.id}`),
    )
  }
}
