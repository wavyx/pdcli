import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class FilterGetCommand extends BaseCommand {
  static description = 'Get a filter by ID'

  static examples = [
    '<%= config.bin %> filter get 5',
    '<%= config.bin %> filter get 5 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Filter ID' }),
  }

  async run() {
    const { args } = await this.parse(FilterGetCommand)
    const body = await this.apiClient.get(`/api/v1/filters/${args.id}`)
    await outputRecord(this, body.data)
  }
}
