import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class ProjectUpdateCommand extends BaseCommand {
  static description =
    'Update a project (v2 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> project update 7 --title "Relaunch"',
    '<%= config.bin %> project update 7 --status closed',
    '<%= config.bin %> project update 7 --owner 9',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Project ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    title: Flags.string({ description: 'Project title' }),
    description: Flags.string({ description: 'Project description' }),
    status: Flags.string({ description: 'Project status' }),
    'start-date': Flags.string({ description: 'Start date (YYYY-MM-DD)' }),
    'end-date': Flags.string({ description: 'End date (YYYY-MM-DD)' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    board: Flags.integer({ description: 'Board ID' }),
    phase: Flags.integer({ description: 'Phase ID' }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { args, flags } = await this.parse(ProjectUpdateCommand)

    const body = buildWriteBody({
      typed: {
        title: flags.title,
        description: flags.description,
        status: flags.status,
        start_date: flags['start-date'],
        end_date: flags['end-date'],
        owner_id: flags.owner,
        board_id: flags.board,
        phase_id: flags.phase,
      },
      rawBody: flags.body,
    })

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.patch(`/api/v2/projects/${args.id}`, {
      body,
    })
    await outputRecord(this, res.data)
  }
}
