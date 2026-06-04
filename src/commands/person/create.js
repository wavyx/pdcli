import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'

export default class PersonCreateCommand extends BaseCommand {
  static description = 'Create a person'

  static examples = [
    '<%= config.bin %> person create --name "Jane Doe" --email jane@acme.com',
    '<%= config.bin %> person create --name "Jane" --field "Segment=Enterprise"',
    '<%= config.bin %> person create --name "Raw" --body \'{"visible_to":"3"}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ required: true, description: 'Person name' }),
    email: Flags.string({
      multiple: true,
      description: 'Email address (repeatable; first is primary)',
    }),
    phone: Flags.string({
      multiple: true,
      description: 'Phone number (repeatable; first is primary)',
    }),
    org: Flags.integer({ description: 'Linked organization ID' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { flags } = await this.parse(PersonCreateCommand)

    const body = buildWriteBody({
      typed: {
        name: flags.name,
        org_id: flags.org,
        owner_id: flags.owner,
        emails: flags.email?.map((value, i) => ({ value, primary: i === 0 })),
        phones: flags.phone?.map((value, i) => ({ value, primary: i === 0 })),
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'person', flags.field),
    })

    const res = await this.apiClient.post('/api/v2/persons', { body })
    await outputRecord(this, res.data, 'person')
  }
}
