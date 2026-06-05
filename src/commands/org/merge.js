import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class OrgMergeCommand extends BaseCommand {
  static description =
    'Merge one organization into another. WARNING: the positional <id> is ' +
    'the LOSING record — Pipedrive deletes it. --into is the surviving ' +
    'record whose data wins on conflict. All related data (deals, ' +
    'activities, notes, files) is transferred to the survivor.'

  static examples = [
    '<%= config.bin %> org merge 123 --into 456',
    '<%= config.bin %> org merge 123 --into 456 --yes',
  ]

  static args = {
    id: Args.integer({
      required: true,
      description: 'ID of the organization to merge and DELETE (the loser)',
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    into: Flags.integer({
      required: true,
      description: 'ID of the surviving organization to keep (the winner)',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(OrgMergeCommand)

    if (args.id === flags.into) {
      throw new CliError('Cannot merge an organization into itself', {
        exitCode: 64,
      })
    }

    const ok = await confirmAction(
      `Merge organization ${args.id} into ${flags.into}? ` +
        `Organization ${args.id} will be deleted.`,
      flags.yes,
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    // The v1 merge response only carries { id }; re-fetch the full survivor
    // from v2 so output matches `org get`.
    await this.apiClient.put(`/api/v1/organizations/${args.id}/merge`, {
      body: { merge_with_id: flags.into },
    })

    this.logToStderr(`Merged organization ${args.id} into ${flags.into}`)

    const body = await this.apiClient.get(`/api/v2/organizations/${flags.into}`)
    await outputRecord(this, body.data, 'org')
  }
}
