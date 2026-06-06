import { Args } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { collectPages } from '../../../lib/pagination.js'

const columns = {
  uuid: { header: 'ID' },
  content: {
    header: 'Content',
    get: (row) => (row.content ?? '').slice(0, 60),
  },
  user_id: { header: 'User' },
  add_time: { header: 'Created' },
}

export default class NoteCommentListCommand extends BaseCommand {
  static description = 'List comments on a note'

  static examples = [
    '<%= config.bin %> note comment list 5',
    '<%= config.bin %> note comment list 5 --output json',
  ]

  static args = {
    noteId: Args.integer({ required: true, description: 'Note ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { args, flags } = await this.parse(NoteCommentListCommand)
    const limit = flags.limit ?? 100

    const query = { limit: Math.min(limit, 100) }

    const items = await collectPages(
      this.apiClient.pageV1(`/api/v1/notes/${args.noteId}/comments`, query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
