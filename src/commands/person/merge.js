import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class PersonMergeCommand extends BaseCommand {
  static description =
    'Merge one person into another. WARNING: the positional <id> is the ' +
    'LOSING record — Pipedrive deletes it. --into is the surviving record ' +
    'whose data wins on conflict. All related data (deals, activities, ' +
    'notes, files) is transferred to the survivor.'

  static examples = [
    '<%= config.bin %> person merge 123 --into 456',
    '<%= config.bin %> person merge 123 --into 456 --yes',
  ]

  static args = {
    id: Args.integer({
      required: true,
      description: 'ID of the person to merge and DELETE (the loser)',
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    into: Flags.integer({
      required: true,
      description: 'ID of the surviving person to keep (the winner)',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(PersonMergeCommand)

    if (args.id === flags.into) {
      throw new CliError('Cannot merge a person into itself', { exitCode: 64 })
    }

    const ok = await confirmAction(
      `Merge person ${args.id} into ${flags.into}? ` +
        `Person ${args.id} will be deleted.`,
      flags.yes,
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    const body = await this.apiClient.put(`/api/v1/persons/${args.id}/merge`, {
      body: { merge_with_id: flags.into },
    })

    this.logToStderr(`Merged person ${args.id} into ${flags.into}`)
    await outputRecord(this, body.data, 'person')
  }
}
