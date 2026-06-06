import { Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { collectPages } from '../../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  type: { header: 'Type' },
  owner: {
    header: 'Owner Org',
    get: (row) => row.rel_owner_org_id?.name ?? '',
  },
  linked: {
    header: 'Linked Org',
    get: (row) => row.rel_linked_org_id?.name ?? '',
  },
  related: {
    header: 'Related',
    get: (row) => row.related_organization_name ?? '',
  },
}

export default class OrgRelationshipListCommand extends BaseCommand {
  static description = 'List relationships for an organization'

  static examples = [
    '<%= config.bin %> org relationship list --org 1481',
    '<%= config.bin %> org relationship list --org 1481 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    org: Flags.integer({
      required: true,
      description: 'Organization ID to list relationships for',
    }),
  }

  async run() {
    const { flags } = await this.parse(OrgRelationshipListCommand)
    const limit = flags.limit ?? 500

    const query = {
      org_id: flags.org,
      limit: Math.min(limit, 500),
    }

    const items = await collectPages(
      this.apiClient.pageV1('/api/v1/organizationRelationships', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
