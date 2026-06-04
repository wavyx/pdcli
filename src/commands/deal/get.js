import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class DealGetCommand extends BaseCommand {
  static description = 'Get a deal by ID'

  static examples = [
    '<%= config.bin %> deal get 42',
    '<%= config.bin %> deal get 42 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  async run() {
    const { args } = await this.parse(DealGetCommand)
    const body = await this.apiClient.get(`/api/v2/deals/${args.id}`)
    await outputRecord(this, body.data, 'deal')
  }
}
