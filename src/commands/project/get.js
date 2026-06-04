import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class ProjectGetCommand extends BaseCommand {
  static description = 'Get a project by ID'

  static examples = [
    '<%= config.bin %> project get 3',
    '<%= config.bin %> project get 3 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Project ID' }),
  }

  async run() {
    const { args } = await this.parse(ProjectGetCommand)
    const body = await this.apiClient.get(`/api/v2/projects/${args.id}`)
    await outputRecord(this, body.data)
  }
}
