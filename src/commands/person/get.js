import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class PersonGetCommand extends BaseCommand {
  static description = 'Get a person by ID'

  static examples = [
    '<%= config.bin %> person get 5',
    '<%= config.bin %> person get 5 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Person ID' }),
  }

  async run() {
    const { args } = await this.parse(PersonGetCommand)
    const body = await this.apiClient.get(`/api/v2/persons/${args.id}`)
    await outputRecord(this, body.data, 'person')
  }
}
