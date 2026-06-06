import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { outputRecord } from '../../../lib/entity-view.js'

export default class OrgFollowerAddCommand extends BaseCommand {
  static description = 'Add a follower (user) to an organization'

  static examples = [
    '<%= config.bin %> org follower add 42 --user 5',
    '<%= config.bin %> org follower add 42 --user 5 --output json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Organization ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    user: Flags.integer({ required: true, description: 'User ID' }),
  }

  async run() {
    const { args, flags } = await this.parse(OrgFollowerAddCommand)

    const res = await this.apiClient.post(
      `/api/v2/organizations/${args.id}/followers`,
      { body: { user_id: flags.user } },
    )
    await outputRecord(this, res.data)
  }
}
