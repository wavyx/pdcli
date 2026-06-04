import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  title: { header: 'Title' },
  status: { header: 'Status' },
  owner_id: { header: 'Owner' },
  start_date: { header: 'Start' },
  end_date: { header: 'End' },
}

export default class ProjectListCommand extends BaseCommand {
  static description = 'List projects'

  static examples = [
    '<%= config.bin %> project list',
    '<%= config.bin %> project list --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { flags } = await this.parse(ProjectListCommand)
    const limit = flags.limit ?? 100

    const query = {
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/projects', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
