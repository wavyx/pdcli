import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class LeadUpdateCommand extends BaseCommand {
  static description = 'Update a lead (v1 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> lead update adf21080-0e10-11eb-879b-05d71fb426ec --title "Renamed"',
    '<%= config.bin %> lead update adf21080-0e10-11eb-879b-05d71fb426ec --value 7500 --currency USD',
  ]

  static args = {
    id: Args.string({ required: true, description: 'Lead ID (UUID)' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    title: Flags.string({ description: 'Lead title' }),
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
    const { args, flags } = await this.parse(LeadUpdateCommand)

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

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.patch(`/api/v1/leads/${args.id}`, {
      body,
    })
    await outputRecord(this, res.data, 'deal')
  }
}
