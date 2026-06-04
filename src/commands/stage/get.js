import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class StageGetCommand extends BaseCommand {
  static description = 'Get a stage by ID'

  static examples = [
    '<%= config.bin %> stage get 5',
    '<%= config.bin %> stage get 5 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Stage ID' }),
  }

  async run() {
    const { args } = await this.parse(StageGetCommand)
    const body = await this.apiClient.get(`/api/v2/stages/${args.id}`)
    await outputRecord(this, body.data)
  }
}
