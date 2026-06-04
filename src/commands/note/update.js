import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class NoteUpdateCommand extends BaseCommand {
  static description = 'Update a note (only provided fields change)'

  static examples = [
    '<%= config.bin %> note update 5 --content "Revised note"',
    '<%= config.bin %> note update 5 --body \'{"pinned_to_deal_flag":1}\'',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Note ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    content: Flags.string({ description: 'Note content' }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { args, flags } = await this.parse(NoteUpdateCommand)

    const body = buildWriteBody({
      typed: {
        content: flags.content,
      },
      rawBody: flags.body,
    })

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag, --field, or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.put(`/api/v1/notes/${args.id}`, { body })
    await outputRecord(this, res.data)
  }
}
