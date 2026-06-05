import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

function primary(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  return (list.find((e) => e.primary) ?? list[0]).value ?? ''
}

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  email: { header: 'Email', get: (row) => primary(row.emails) },
  phone: { header: 'Phone', get: (row) => primary(row.phones) },
  org_id: { header: 'Org' },
  owner_id: { header: 'Owner' },
}

export default class PersonListCommand extends BaseCommand {
  static description = 'List persons (contacts)'

  static examples = [
    '<%= config.bin %> person list',
    '<%= config.bin %> person list --org 7 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    owner: Flags.integer({ description: 'Filter by owner (user) ID' }),
    org: Flags.integer({ description: 'Filter by organization ID' }),
  }

  async run() {
    const { flags } = await this.parse(PersonListCommand)
    const limit = flags.limit ?? 100

    const query = {
      owner_id: flags.owner,
      org_id: flags.org,
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/persons', query),
      limit,
    )
    await this.outputResults(items, columns, { entity: 'person' })
  }
}
