import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError, ApiError } from '../../lib/errors.js'
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

    // Unless --yes, look up BOTH records first so the prompt can name them and
    // a bad id hard-fails BEFORE the irreversible merge. With --yes we skip the
    // lookups and the prompt entirely to save rate-limit budget.
    if (!flags.yes) {
      const loser = await this.apiClient.get(`/api/v2/organizations/${args.id}`)
      const winner = await this.apiClient.get(
        `/api/v2/organizations/${flags.into}`,
      )

      const ok = await confirmAction(
        `Merge organization ${args.id} "${loser.data?.name}" into ` +
          `${flags.into} "${winner.data?.name}"? ` +
          `Organization ${args.id} "${loser.data?.name}" will be DELETED.`,
        false,
        { default: false },
      )
      if (!ok) {
        throw new CliError('Aborted', { exitCode: 1 })
      }
    }

    // The v1 merge response only carries { id }; re-fetch the full survivor
    // from v2 so output matches `org get`.
    const merge = await this.apiClient.put(
      `/api/v1/organizations/${args.id}/merge`,
      { body: { merge_with_id: flags.into } },
    )

    this.logToStderr(`Merged organization ${args.id} into ${flags.into}`)

    let record
    try {
      const body = await this.apiClient.get(
        `/api/v2/organizations/${flags.into}`,
      )
      record = body.data
    } catch (err) {
      // Only API-level failures (eventual-consistency 404, transient 5xx)
      // degrade gracefully — anything else is a real bug and must surface.
      if (!(err instanceof ApiError)) throw err
      // The merge already succeeded and is irreversible; an eventual-consistency
      // 404 or transient 500 on the re-fetch must not look like a failure, or an
      // agent would retry the destructive op. Warn and emit the minimal id.
      this.logToStderr('Warning: merged, but could not load the survivor view')
      record = { id: merge.data?.id ?? flags.into }
    }

    await outputRecord(this, record, 'org')
  }
}
