import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  title: { header: 'Title' },
  person_id: { header: 'Person' },
  organization_id: { header: 'Org' },
  value: {
    header: 'Value',
    get: (row) =>
      row.value ? `${row.value.amount} ${row.value.currency}` : '',
  },
  add_time: { header: 'Created' },
}

export default class LeadListCommand extends BaseCommand {
  static description = 'List leads'

  static examples = [
    '<%= config.bin %> lead list',
    '<%= config.bin %> lead list --owner 3 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    owner: Flags.integer({ description: 'Filter by owner (user) ID' }),
    person: Flags.integer({ description: 'Filter by person ID' }),
    org: Flags.integer({ description: 'Filter by organization ID' }),
  }

  async run() {
    const { flags } = await this.parse(LeadListCommand)
    const limit = flags.limit ?? 100

    const query = {
      owner_id: flags.owner,
      person_id: flags.person,
      organization_id: flags.org,
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV1('/api/v1/leads', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
