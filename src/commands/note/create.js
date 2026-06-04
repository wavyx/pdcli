import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class NoteCreateCommand extends BaseCommand {
  static description = 'Create a note'

  static examples = [
    '<%= config.bin %> note create --content "Called the lead"',
    '<%= config.bin %> note create --content "Follow up" --deal 42',
    '<%= config.bin %> note create --content "Pinned" --body \'{"pinned_to_deal_flag":1}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    content: Flags.string({ required: true, description: 'Note content' }),
    deal: Flags.integer({ description: 'Attach to deal ID' }),
    person: Flags.integer({ description: 'Attach to person ID' }),
    org: Flags.integer({ description: 'Attach to organization ID' }),
    lead: Flags.string({ description: 'Attach to lead ID (UUID)' }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { flags } = await this.parse(NoteCreateCommand)

    const body = buildWriteBody({
      typed: {
        content: flags.content,
        deal_id: flags.deal,
        person_id: flags.person,
        org_id: flags.org,
        lead_id: flags.lead,
      },
      rawBody: flags.body,
    })

    const res = await this.apiClient.post('/api/v1/notes', { body })
    await outputRecord(this, res.data)
  }
}
