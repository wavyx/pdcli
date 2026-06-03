import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class ActivityUpdateCommand extends BaseCommand {
  static description =
    'Update an activity (v2 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> activity update 9 --subject "Renamed"',
    '<%= config.bin %> activity update 9 --done',
    '<%= config.bin %> activity update 9 --field "Outcome=Positive"',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Activity ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    subject: Flags.string({ description: 'Activity subject' }),
    type: Flags.string({ description: 'Activity type' }),
    'due-date': Flags.string({ description: 'Due date (YYYY-MM-DD)' }),
    'due-time': Flags.string({ description: 'Due time (HH:MM)' }),
    duration: Flags.string({ description: 'Duration (HH:MM)' }),
    deal: Flags.integer({ description: 'Linked deal ID' }),
    person: Flags.integer({ description: 'Linked person ID' }),
    org: Flags.integer({ description: 'Linked organization ID' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    note: Flags.string({ description: 'Activity note' }),
    done: Flags.boolean({
      description: 'Mark the activity as done',
      exclusive: ['undone'],
    }),
    undone: Flags.boolean({
      description: 'Mark the activity as not done',
      exclusive: ['done'],
    }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { args, flags } = await this.parse(ActivityUpdateCommand)

    let done
    if (flags.done) done = true
    else if (flags.undone) done = false

    const body = buildWriteBody({
      typed: {
        subject: flags.subject,
        type: flags.type,
        due_date: flags['due-date'],
        due_time: flags['due-time'],
        duration: flags.duration,
        deal_id: flags.deal,
        participants:
          flags.person != null
            ? [{ person_id: flags.person, primary: true }]
            : undefined,
        org_id: flags.org,
        owner_id: flags.owner,
        note: flags.note,
        done,
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'activity', flags.field),
    })

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag, --field, or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.patch(`/api/v2/activities/${args.id}`, {
      body,
    })
    await outputRecord(this, res.data, 'activity')
  }
}
