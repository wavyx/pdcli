import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { outputRecord } from '../../../lib/entity-view.js'

export default class NoteCommentUpdateCommand extends BaseCommand {
  static description = 'Update a comment on a note'

  static examples = [
    '<%= config.bin %> note comment update 5 --comment <uuid> --content "Edited"',
  ]

  static args = {
    noteId: Args.integer({ required: true, description: 'Note ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    comment: Flags.string({
      required: true,
      description: 'Comment ID (UUID)',
    }),
    content: Flags.string({
      required: true,
      description: 'New comment content',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(NoteCommentUpdateCommand)

    const res = await this.apiClient.put(
      `/api/v1/notes/${args.noteId}/comments/${flags.comment}`,
      { body: { content: flags.content } },
    )
    await outputRecord(this, res.data)
  }
}
