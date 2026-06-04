import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class PersonUpdateCommand extends BaseCommand {
  static description =
    'Update a person (v2 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> person update 42 --name "New name"',
    '<%= config.bin %> person update 42 --email new@acme.com',
    '<%= config.bin %> person update 42 --field "Segment=Enterprise"',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Person ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ description: 'Person name' }),
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
    const { args, flags } = await this.parse(PersonUpdateCommand)

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

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag, --field, or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.patch(`/api/v2/persons/${args.id}`, {
      body,
    })
    await outputRecord(this, res.data, 'person')
  }
}
