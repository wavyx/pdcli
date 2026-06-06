import { Args } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { collectPages } from '../../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  person_id: {
    header: 'Person',
    get: (row) => row.person_id?.value ?? '',
  },
  name: {
    header: 'Name',
    get: (row) => row.person_id?.name ?? '',
  },
  add_time: { header: 'Added' },
}

export default class DealParticipantListCommand extends BaseCommand {
  static description = 'List participants of a deal'

  static examples = [
    '<%= config.bin %> deal participant list 42',
    '<%= config.bin %> deal participant list 42 --output json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { args, flags } = await this.parse(DealParticipantListCommand)
    const limit = flags.limit ?? 100

    const query = { limit: Math.min(limit, 500) }

    const items = await collectPages(
      this.apiClient.pageV1(`/api/v1/deals/${args.id}/participants`, query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
