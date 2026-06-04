import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  type: { header: 'Type' },
  active_flag: { header: 'Active' },
}

export default class FilterListCommand extends BaseCommand {
  static description = 'List filters'

  static examples = [
    '<%= config.bin %> filter list',
    '<%= config.bin %> filter list --type deals --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    type: Flags.string({
      description: 'Filter by type',
      options: [
        'deals',
        'leads',
        'org',
        'people',
        'products',
        'activity',
        'projects',
      ],
    }),
  }

  async run() {
    const { flags } = await this.parse(FilterListCommand)

    const body = await this.apiClient.get('/api/v1/filters', {
      query: { type: flags.type },
    })
    await this.outputResults(body.data, columns)
  }
}
