import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { CliError } from '../../lib/errors.js'

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
    filter: Flags.integer({ description: 'Filter by saved filter ID' }),
    ids: Flags.string({
      description: 'Comma-separated IDs to fetch (max 100)',
    }),
    'sort-by': Flags.string({
      description: 'Sort field',
      options: ['id', 'update_time', 'add_time'],
    }),
    'sort-direction': Flags.string({
      description: 'Sort direction',
      options: ['asc', 'desc'],
    }),
    'updated-since': Flags.string({
      description:
        'Only items updated at/after this RFC3339 time (no fractional seconds)',
    }),
    'updated-until': Flags.string({
      description:
        'Only items updated before this RFC3339 time (no fractional seconds)',
    }),
  }

  async run() {
    const { flags } = await this.parse(PersonListCommand)
    const limit = flags.limit ?? 500

    if (flags.ids && flags.ids.split(',').length > 100) {
      throw new CliError('--ids accepts at most 100 IDs', { exitCode: 64 })
    }

    const query = {
      owner_id: flags.owner,
      org_id: flags.org,
      filter_id: flags.filter,
      ids: flags.ids,
      sort_by: flags['sort-by'],
      sort_direction: flags['sort-direction'],
      updated_since: flags['updated-since'],
      updated_until: flags['updated-until'],
      limit: Math.min(limit, 500),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/persons', query),
      limit,
    )
    await this.outputResults(items, columns, { entity: 'person' })
  }
}
