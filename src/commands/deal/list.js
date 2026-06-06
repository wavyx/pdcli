import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { CliError } from '../../lib/errors.js'

const columns = {
  id: { header: 'ID' },
  title: { header: 'Title' },
  value: {
    header: 'Value',
    get: (row) =>
      row.value != null ? `${row.value} ${row.currency ?? ''}`.trim() : '',
  },
  status: { header: 'Status' },
  stage_id: { header: 'Stage' },
  person_id: { header: 'Person' },
  org_id: { header: 'Org' },
  owner_id: { header: 'Owner' },
}

export default class DealListCommand extends BaseCommand {
  static description = 'List deals'

  static examples = [
    '<%= config.bin %> deal list',
    '<%= config.bin %> deal list --status won --limit 50',
    '<%= config.bin %> deal list --stage 3 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    archived: Flags.boolean({
      description: 'List archived deals instead of active ones',
      default: false,
    }),
    status: Flags.string({
      description: 'Filter by status',
      options: ['open', 'won', 'lost', 'deleted'],
    }),
    stage: Flags.integer({ description: 'Filter by stage ID' }),
    pipeline: Flags.integer({ description: 'Filter by pipeline ID' }),
    owner: Flags.integer({ description: 'Filter by owner (user) ID' }),
    person: Flags.integer({ description: 'Filter by person ID' }),
    org: Flags.integer({ description: 'Filter by organization ID' }),
    filter: Flags.integer({ description: 'Filter by saved filter ID' }),
    ids: Flags.string({
      description: 'Comma-separated IDs to fetch (max 100)',
      // The API silently drops `ids` when filter_id is present — refuse
      // the combination instead (matches deal bulk-update).
      exclusive: ['filter'],
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
    const { flags } = await this.parse(DealListCommand)
    const limit = flags.limit ?? 500

    const idList = flags.ids
      ?.split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (idList && idList.length > 100) {
      throw new CliError('--ids accepts at most 100 IDs', { exitCode: 64 })
    }

    const query = {
      status: flags.status,
      stage_id: flags.stage,
      pipeline_id: flags.pipeline,
      owner_id: flags.owner,
      person_id: flags.person,
      org_id: flags.org,
      filter_id: flags.filter,
      ids: idList?.join(','),
      sort_by: flags['sort-by'],
      sort_direction: flags['sort-direction'],
      updated_since: flags['updated-since'],
      updated_until: flags['updated-until'],
      limit: Math.min(limit, 500),
    }

    // Archived deals share the same params and cursor pager as active deals.
    const path = flags.archived ? '/api/v2/deals/archived' : '/api/v2/deals'
    const items = await collectPages(this.apiClient.pageV2(path, query), limit)
    await this.outputResults(items, columns, { entity: 'deal' })
  }
}
