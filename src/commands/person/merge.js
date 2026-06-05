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

    // Unless --yes, look up BOTH records first so the prompt can name them and
    // a bad id hard-fails BEFORE the irreversible merge. With --yes we skip the
    // lookups and the prompt entirely to save rate-limit budget.
    if (!flags.yes) {
      const loser = await this.apiClient.get(`/api/v2/persons/${args.id}`)
      const winner = await this.apiClient.get(`/api/v2/persons/${flags.into}`)

      const ok = await confirmAction(
        `Merge person ${args.id} "${loser.data?.name}" into ` +
          `${flags.into} "${winner.data?.name}"? ` +
          `Person ${args.id} "${loser.data?.name}" will be DELETED.`,
        false,
        { default: false },
      )
      if (!ok) {
        throw new CliError('Aborted', { exitCode: 1 })
      }
    }

    // The v1 merge response carries the raw v1 shape (top-level hash custom
    // fields, email/phone arrays). Re-fetch the survivor from v2 so output
    // matches `person get`.
    const merge = await this.apiClient.put(`/api/v1/persons/${args.id}/merge`, {
      body: { merge_with_id: flags.into },
    })

    this.logToStderr(`Merged person ${args.id} into ${flags.into}`)

    let record
    try {
      const body = await this.apiClient.get(`/api/v2/persons/${flags.into}`)
      record = body.data
    } catch {
      // The merge already succeeded and is irreversible; an eventual-consistency
      // 404 or transient 500 on the re-fetch must not look like a failure, or an
      // agent would retry the destructive op. Warn and emit the minimal id.
      this.logToStderr('Warning: merged, but could not load the survivor view')
      record = { id: merge.data?.id ?? flags.into }
    }

    await outputRecord(this, record, 'person')
  }
}
