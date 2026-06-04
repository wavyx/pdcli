import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class NoteGetCommand extends BaseCommand {
  static description = 'Get a note by ID'

  static examples = [
    '<%= config.bin %> note get 5',
    '<%= config.bin %> note get 5 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Note ID' }),
  }

  async run() {
    const { args } = await this.parse(NoteGetCommand)
    const body = await this.apiClient.get(`/api/v1/notes/${args.id}`)
    await outputRecord(this, body.data)
  }
}
