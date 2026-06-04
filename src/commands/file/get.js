import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class FileGetCommand extends BaseCommand {
  static description = 'Get a file by ID'

  static examples = [
    '<%= config.bin %> file get 5',
    '<%= config.bin %> file get 5 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'File ID' }),
  }

  async run() {
    const { args } = await this.parse(FileGetCommand)
    const body = await this.apiClient.get(`/api/v1/files/${args.id}`)
    await outputRecord(this, body.data)
  }
}
