import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'

export default class ActivityCreateCommand extends BaseCommand {
  static description = 'Create an activity'

  static examples = [
    '<%= config.bin %> activity create --subject "Demo call" --type call --due-date 2026-06-10',
    '<%= config.bin %> activity create --subject "Follow up" --field "Outcome=Positive"',
    '<%= config.bin %> activity create --subject "Raw" --body \'{"priority":5}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    subject: Flags.string({ required: true, description: 'Activity subject' }),
    type: Flags.string({ default: 'task', description: 'Activity type' }),
    'due-date': Flags.string({ description: 'Due date (YYYY-MM-DD)' }),
    'due-time': Flags.string({ description: 'Due time (HH:MM)' }),
    duration: Flags.string({ description: 'Duration (HH:MM)' }),
    deal: Flags.integer({ description: 'Linked deal ID' }),
    person: Flags.integer({ description: 'Linked person ID' }),
    org: Flags.integer({ description: 'Linked organization ID' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    note: Flags.string({ description: 'Activity note' }),
    done: Flags.boolean({ description: 'Mark the activity as done' }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { flags } = await this.parse(ActivityCreateCommand)

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
        done: flags.done ? true : undefined,
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'activity', flags.field),
    })

    const res = await this.apiClient.post('/api/v2/activities', { body })
    await outputRecord(this, res.data, 'activity')
  }
}
