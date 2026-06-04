import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class LeadGetCommand extends BaseCommand {
  static description = 'Get a lead by ID'

  static examples = [
    '<%= config.bin %> lead get adf21080-0e10-11eb-879b-05d71fb426ec',
    '<%= config.bin %> lead get adf21080-0e10-11eb-879b-05d71fb426ec --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.string({ required: true, description: 'Lead ID (UUID)' }),
  }

  async run() {
    const { args } = await this.parse(LeadGetCommand)
    const body = await this.apiClient.get(`/api/v1/leads/${args.id}`)
    await outputRecord(this, body.data, 'deal')
  }
}
