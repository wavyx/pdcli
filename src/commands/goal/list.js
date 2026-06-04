import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'

const columns = {
  id: { header: 'ID' },
  title: { header: 'Title', get: (row) => row.title ?? '' },
  type: { header: 'Type', get: (row) => row.type?.name ?? '' },
  interval: { header: 'Interval', get: (row) => row.interval ?? '' },
  owner_id: { header: 'Owner' },
}

export default class GoalListCommand extends BaseCommand {
  static description = 'List goals'

  static examples = [
    '<%= config.bin %> goal list',
    '<%= config.bin %> goal list --assignee 7 --type deals_won --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    assignee: Flags.integer({ description: 'Filter by assignee (user) ID' }),
    type: Flags.string({ description: 'Filter by goal type name' }),
  }

  async run() {
    const { flags } = await this.parse(GoalListCommand)

    const body = await this.apiClient.get('/api/v1/goals/find', {
      query: {
        'assignee.id': flags.assignee,
        'type.name': flags.type,
      },
    })
    await this.outputResults(body.data?.goals ?? [], columns)
  }
}
