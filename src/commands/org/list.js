import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  owner_id: { header: 'Owner' },
  add_time: { header: 'Created' },
}

export default class OrgListCommand extends BaseCommand {
  static description = 'List organizations'

  static examples = [
    '<%= config.bin %> org list',
    '<%= config.bin %> org list --owner 3 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    owner: Flags.integer({ description: 'Filter by owner (user) ID' }),
  }

  async run() {
    const { flags } = await this.parse(OrgListCommand)
    const limit = flags.limit ?? 100

    const query = {
      owner_id: flags.owner,
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/organizations', query),
      limit,
    )
    await this.outputResults(items, columns, { entity: 'org' })
  }
}
