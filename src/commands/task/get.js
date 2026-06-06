import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class TaskGetCommand extends BaseCommand {
  static description = 'Get a task by ID'

  static examples = [
    '<%= config.bin %> task get 9',
    '<%= config.bin %> task get 9 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Task ID' }),
  }

  async run() {
    const { args } = await this.parse(TaskGetCommand)
    const body = await this.apiClient.get(`/api/v2/tasks/${args.id}`)
    await outputRecord(this, body.data)
  }
}
