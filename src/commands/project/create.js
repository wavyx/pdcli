import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class ProjectCreateCommand extends BaseCommand {
  static description = 'Create a project'

  static examples = [
    '<%= config.bin %> project create --title "Launch"',
    '<%= config.bin %> project create --title "Launch" --owner 3 --status open',
    '<%= config.bin %> project create --title "Raw" --body \'{"deal_ids":[1,2]}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    title: Flags.string({ required: true, description: 'Project title' }),
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
    const { flags } = await this.parse(ProjectCreateCommand)

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

    const res = await this.apiClient.post('/api/v2/projects', { body })
    await outputRecord(this, res.data)
  }
}
