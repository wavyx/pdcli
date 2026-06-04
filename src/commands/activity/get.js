import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class ActivityGetCommand extends BaseCommand {
  static description = 'Get an activity by ID'

  static examples = [
    '<%= config.bin %> activity get 9',
    '<%= config.bin %> activity get 9 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Activity ID' }),
  }

  async run() {
    const { args } = await this.parse(ActivityGetCommand)
    const body = await this.apiClient.get(`/api/v2/activities/${args.id}`)
    await outputRecord(this, body.data, 'activity')
  }
}
