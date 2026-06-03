import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'

export default class DealCreateCommand extends BaseCommand {
  static description = 'Create a deal'

  static examples = [
    '<%= config.bin %> deal create --title "Acme renewal" --value 5000 --currency EUR',
    '<%= config.bin %> deal create --title "Sized" --field "Deal Size=Large"',
    '<%= config.bin %> deal create --title "Raw" --body \'{"probability":75}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    title: Flags.string({ required: true, description: 'Deal title' }),
    value: Flags.integer({ description: 'Deal value' }),
    currency: Flags.string({ description: 'Deal currency (e.g. EUR)' }),
    status: Flags.string({
      description: 'Deal status',
      options: ['open', 'won', 'lost'],
    }),
    stage: Flags.integer({ description: 'Stage ID' }),
    pipeline: Flags.integer({ description: 'Pipeline ID' }),
    person: Flags.integer({ description: 'Linked person ID' }),
    org: Flags.integer({ description: 'Linked organization ID' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    probability: Flags.integer({ description: 'Success probability (0-100)' }),
    'expected-close-date': Flags.string({
      description: 'Expected close date (YYYY-MM-DD)',
    }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { flags } = await this.parse(DealCreateCommand)

    const body = buildWriteBody({
      typed: {
        title: flags.title,
        value: flags.value,
        currency: flags.currency,
        status: flags.status,
        stage_id: flags.stage,
        pipeline_id: flags.pipeline,
        person_id: flags.person,
        org_id: flags.org,
        owner_id: flags.owner,
        probability: flags.probability,
        expected_close_date: flags['expected-close-date'],
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'deal', flags.field),
    })

    const res = await this.apiClient.post('/api/v2/deals', { body })
    await outputRecord(this, res.data, 'deal')
  }
}
