import { Args } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { collectPages } from '../../../lib/pagination.js'

const columns = {
  user_id: { header: 'User' },
  add_time: { header: 'Added' },
}

export default class PersonFollowerListCommand extends BaseCommand {
  static description = 'List followers of a person'

  static examples = [
    '<%= config.bin %> person follower list 42',
    '<%= config.bin %> person follower list 42 --output json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Person ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { args, flags } = await this.parse(PersonFollowerListCommand)
    const limit = flags.limit ?? 500

    const query = { limit: Math.min(limit, 500) }

    const items = await collectPages(
      this.apiClient.pageV2(`/api/v2/persons/${args.id}/followers`, query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
