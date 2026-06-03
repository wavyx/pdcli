import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class OrgGetCommand extends BaseCommand {
  static description = 'Get an organization by ID'

  static examples = [
    '<%= config.bin %> org get 7',
    '<%= config.bin %> org get 7 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Organization ID' }),
  }

  async run() {
    const { args } = await this.parse(OrgGetCommand)
    const body = await this.apiClient.get(`/api/v2/organizations/${args.id}`)
    await outputRecord(this, body.data, 'org')
  }
}
