import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { CliError } from '../../lib/errors.js'

const columns = {
  id: { header: 'ID' },
  subject: { header: 'Subject' },
  type: { header: 'Type' },
  due_date: { header: 'Due' },
  done: { header: 'Done' },
  deal_id: { header: 'Deal' },
  owner_id: { header: 'Owner' },
}

export default class ActivityListCommand extends BaseCommand {
  static description = 'List activities'

  static examples = [
    '<%= config.bin %> activity list',
    '<%= config.bin %> activity list --todo --deal 42',
    '<%= config.bin %> activity list --type call --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    owner: Flags.integer({ description: 'Filter by owner (user) ID' }),
    deal: Flags.integer({ description: 'Filter by deal ID' }),
    person: Flags.integer({ description: 'Filter by person ID' }),
    org: Flags.integer({ description: 'Filter by organization ID' }),
    type: Flags.string({ description: 'Filter by activity type key' }),
    done: Flags.boolean({
      description: 'Only completed activities',
      exclusive: ['todo'],
    }),
    todo: Flags.boolean({
      description: 'Only open (not done) activities',
      exclusive: ['done'],
    }),
    filter: Flags.integer({ description: 'Filter by saved filter ID' }),
    ids: Flags.string({
      description: 'Comma-separated IDs to fetch (max 100)',
    }),
    'sort-by': Flags.string({
      description: 'Sort field',
      options: ['id', 'update_time', 'add_time', 'due_date'],
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
    const { flags } = await this.parse(ActivityListCommand)
    const limit = flags.limit ?? 500

    if (flags.ids && flags.ids.split(',').length > 100) {
      throw new CliError('--ids accepts at most 100 IDs', { exitCode: 64 })
    }

    const query = {
      owner_id: flags.owner,
      deal_id: flags.deal,
      person_id: flags.person,
      org_id: flags.org,
      type: flags.type,
      done: flags.done ? true : flags.todo ? false : undefined,
      filter_id: flags.filter,
      ids: flags.ids,
      sort_by: flags['sort-by'],
      sort_direction: flags['sort-direction'],
      updated_since: flags['updated-since'],
      updated_until: flags['updated-until'],
      limit: Math.min(limit, 500),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/activities', query),
      limit,
    )
    await this.outputResults(items, columns, { entity: 'activity' })
  }
}
