import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { outputRecord } from '../../../lib/entity-view.js'

export default class NoteCommentAddCommand extends BaseCommand {
  static description = 'Add a comment to a note'

  static examples = [
    '<%= config.bin %> note comment add 5 --content "Nice work"',
    '<%= config.bin %> note comment add 5 --content "Reviewed" --output json',
  ]

  static args = {
    noteId: Args.integer({ required: true, description: 'Note ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    content: Flags.string({ required: true, description: 'Comment content' }),
  }

  async run() {
    const { args, flags } = await this.parse(NoteCommentAddCommand)

    const res = await this.apiClient.post(
      `/api/v1/notes/${args.noteId}/comments`,
      { body: { content: flags.content } },
    )
    await outputRecord(this, res.data)
  }
}
