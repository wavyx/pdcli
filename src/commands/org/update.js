import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class OrgUpdateCommand extends BaseCommand {
  static description =
    'Update an organization (v2 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> org update 7 --name "Acme Inc"',
    '<%= config.bin %> org update 7 --owner 9',
    '<%= config.bin %> org update 7 --field "Tier=Gold"',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Organization ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ description: 'Organization name' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { args, flags } = await this.parse(OrgUpdateCommand)

    const body = buildWriteBody({
      typed: {
        name: flags.name,
        owner_id: flags.owner,
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'org', flags.field),
    })

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag, --field, or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.patch(`/api/v2/organizations/${args.id}`, {
      body,
    })
    await outputRecord(this, res.data, 'org')
  }
}
