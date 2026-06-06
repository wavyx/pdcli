import { Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { outputRecord } from '../../../lib/entity-view.js'

export default class OrgRelationshipAddCommand extends BaseCommand {
  static description =
    'Create an organization relationship. For a parent relationship the ' +
    '--owner organization is the parent and --linked is the daughter.'

  static examples = [
    '<%= config.bin %> org relationship add --type parent --owner 1481 --linked 1480',
    '<%= config.bin %> org relationship add --type related --owner 1 --linked 2',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    type: Flags.string({
      required: true,
      description: 'Relationship type',
      options: ['parent', 'related'],
    }),
    owner: Flags.integer({
      required: true,
      description: 'Owner organization ID (the parent for type parent)',
    }),
    linked: Flags.integer({
      required: true,
      description: 'Linked organization ID (the daughter for type parent)',
    }),
  }

  async run() {
    const { flags } = await this.parse(OrgRelationshipAddCommand)

    const res = await this.apiClient.post('/api/v1/organizationRelationships', {
      body: {
        type: flags.type,
        rel_owner_org_id: flags.owner,
        rel_linked_org_id: flags.linked,
      },
    })
    await outputRecord(this, res.data)
  }
}
