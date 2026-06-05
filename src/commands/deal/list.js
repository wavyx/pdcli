import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

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
    status: Flags.string({
      description: 'Filter by status',
      options: ['open', 'won', 'lost', 'deleted'],
    }),
    stage: Flags.integer({ description: 'Filter by stage ID' }),
    pipeline: Flags.integer({ description: 'Filter by pipeline ID' }),
    owner: Flags.integer({ description: 'Filter by owner (user) ID' }),
    person: Flags.integer({ description: 'Filter by person ID' }),
    org: Flags.integer({ description: 'Filter by organization ID' }),
  }

  async run() {
    const { flags } = await this.parse(DealListCommand)
    const limit = flags.limit ?? 100

    const query = {
      status: flags.status,
      stage_id: flags.stage,
      pipeline_id: flags.pipeline,
      owner_id: flags.owner,
      person_id: flags.person,
      org_id: flags.org,
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/deals', query),
      limit,
    )
    await this.outputResults(items, columns, { entity: 'deal' })
  }
}
