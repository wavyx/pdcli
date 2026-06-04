import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  content: {
    header: 'Content',
    get: (row) => (row.content ?? '').slice(0, 60),
  },
  deal_id: { header: 'Deal' },
  person_id: { header: 'Person' },
  org_id: { header: 'Org' },
  add_time: { header: 'Created' },
}

export default class NoteListCommand extends BaseCommand {
  static description = 'List notes'

  static examples = [
    '<%= config.bin %> note list',
    '<%= config.bin %> note list --deal 42 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    deal: Flags.integer({ description: 'Filter by deal ID' }),
    person: Flags.integer({ description: 'Filter by person ID' }),
    org: Flags.integer({ description: 'Filter by organization ID' }),
  }

  async run() {
    const { flags } = await this.parse(NoteListCommand)
    const limit = flags.limit ?? 100

    const query = {
      deal_id: flags.deal,
      person_id: flags.person,
      org_id: flags.org,
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV1('/api/v1/notes', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
