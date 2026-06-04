import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class LeadCreateCommand extends BaseCommand {
  static description = 'Create a lead'

  static examples = [
    '<%= config.bin %> lead create --title "Acme renewal" --value 5000 --currency EUR',
    '<%= config.bin %> lead create --title "Linked" --person 4 --org 5',
    '<%= config.bin %> lead create --title "Raw" --body \'{"visible_to":"3"}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    title: Flags.string({ required: true, description: 'Lead title' }),
    person: Flags.integer({ description: 'Linked person ID' }),
    org: Flags.integer({ description: 'Linked organization ID' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    value: Flags.string({
      description: 'Lead value amount (requires --currency)',
      dependsOn: ['currency'],
    }),
    currency: Flags.string({
      description: 'Lead value currency (requires --value)',
      dependsOn: ['value'],
    }),
    'expected-close-date': Flags.string({
      description: 'Expected close date (YYYY-MM-DD)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { flags } = await this.parse(LeadCreateCommand)

    const value =
      flags.value !== undefined && flags.currency !== undefined
        ? { amount: Number(flags.value), currency: flags.currency }
        : undefined

    const body = buildWriteBody({
      typed: {
        title: flags.title,
        person_id: flags.person,
        organization_id: flags.org,
        owner_id: flags.owner,
        value,
        expected_close_date: flags['expected-close-date'],
      },
      rawBody: flags.body,
    })

    const res = await this.apiClient.post('/api/v1/leads', { body })
    await outputRecord(this, res.data, 'deal')
  }
}
