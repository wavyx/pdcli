import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class PipelineGetCommand extends BaseCommand {
  static description = 'Get a pipeline by ID'

  static examples = [
    '<%= config.bin %> pipeline get 1',
    '<%= config.bin %> pipeline get 1 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Pipeline ID' }),
  }

  async run() {
    const { args } = await this.parse(PipelineGetCommand)
    const body = await this.apiClient.get(`/api/v2/pipelines/${args.id}`)
    await outputRecord(this, body.data)
  }
}
