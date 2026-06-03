import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'

export default class OrgCreateCommand extends BaseCommand {
  static description = 'Create an organization'

  static examples = [
    '<%= config.bin %> org create --name "Acme Corp"',
    '<%= config.bin %> org create --name "Tiered" --field "Tier=Gold"',
    '<%= config.bin %> org create --name "Raw" --body \'{"visible_to":3}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ required: true, description: 'Organization name' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { flags } = await this.parse(OrgCreateCommand)

    const body = buildWriteBody({
      typed: {
        name: flags.name,
        owner_id: flags.owner,
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'org', flags.field),
    })

    const res = await this.apiClient.post('/api/v2/organizations', { body })
    await outputRecord(this, res.data, 'org')
  }
}
