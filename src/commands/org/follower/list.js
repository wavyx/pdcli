import { Args } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { collectPages } from '../../../lib/pagination.js'

const columns = {
  user_id: { header: 'User' },
  add_time: { header: 'Added' },
}

export default class OrgFollowerListCommand extends BaseCommand {
  static description = 'List followers of an organization'

  static examples = [
    '<%= config.bin %> org follower list 42',
    '<%= config.bin %> org follower list 42 --output json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Organization ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { args, flags } = await this.parse(OrgFollowerListCommand)
    const limit = flags.limit ?? 500

    const query = { limit: Math.min(limit, 500) }

    const items = await collectPages(
      this.apiClient.pageV2(
        `/api/v2/organizations/${args.id}/followers`,
        query,
      ),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
