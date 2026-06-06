import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../../base-command.js'
import { confirmAction } from '../../../lib/confirm.js'
import { CliError } from '../../../lib/errors.js'

export default class NoteCommentDeleteCommand extends BaseCommand {
  static description = 'Delete a comment from a note'

  static examples = [
    '<%= config.bin %> note comment delete 5 --comment <uuid>',
    '<%= config.bin %> note comment delete 5 --comment <uuid> --yes',
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
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(NoteCommentDeleteCommand)

    const ok = await confirmAction(
      `Delete comment ${flags.comment} from note ${args.noteId}?`,
      flags.yes,
      { default: false },
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(
      `/api/v1/notes/${args.noteId}/comments/${flags.comment}`,
    )
    this.log(
      chalk.green(`Deleted comment ${flags.comment} from note ${args.noteId}`),
    )
  }
}
