import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { outputRecord } from '../../../lib/entity-view.js'

export default class DealParticipantAddCommand extends BaseCommand {
  static description = 'Add a participant (person) to a deal'

  static examples = [
    '<%= config.bin %> deal participant add 42 --person 10',
    '<%= config.bin %> deal participant add 42 --person 10 --output json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    person: Flags.integer({ required: true, description: 'Person ID' }),
  }

  async run() {
    const { args, flags } = await this.parse(DealParticipantAddCommand)

    const res = await this.apiClient.post(
      `/api/v1/deals/${args.id}/participants`,
      { body: { person_id: flags.person } },
    )
    await outputRecord(this, res.data)
  }
}
