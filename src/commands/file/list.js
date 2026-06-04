import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  file_type: { header: 'Type' },
  file_size: { header: 'Size' },
  deal_id: { header: 'Deal' },
  person_id: { header: 'Person' },
  add_time: { header: 'Created' },
}

export default class FileListCommand extends BaseCommand {
  static description = 'List files'

  static examples = [
    '<%= config.bin %> file list',
    '<%= config.bin %> file list --limit 50 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { flags } = await this.parse(FileListCommand)
    const limit = flags.limit ?? 100

    const query = {
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV1('/api/v1/files', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
