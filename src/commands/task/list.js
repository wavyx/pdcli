import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  title: { header: 'Title' },
  project_id: { header: 'Project' },
  assignee_id: {
    header: 'Assignee',
    // v2 returns assignee_ids (array); surface the first for the column.
    get: (row) => row.assignee_ids?.[0] ?? '',
  },
  due_date: { header: 'Due' },
  done: { header: 'Done', get: (row) => (row.is_done ? 'yes' : 'no') },
}

export default class TaskListCommand extends BaseCommand {
  static description = 'List tasks'

  static examples = [
    '<%= config.bin %> task list',
    '<%= config.bin %> task list --project 3 --todo',
    '<%= config.bin %> task list --assignee 7 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    project: Flags.integer({ description: 'Filter by project ID' }),
    assignee: Flags.integer({ description: 'Filter by assignee (user) ID' }),
    parent: Flags.integer({ description: 'Filter by parent task ID' }),
    done: Flags.boolean({
      description: 'Only completed tasks',
      exclusive: ['todo'],
    }),
    todo: Flags.boolean({
      description: 'Only open (not done) tasks',
      exclusive: ['done'],
    }),
  }

  async run() {
    const { flags } = await this.parse(TaskListCommand)
    const limit = flags.limit ?? 500

    const query = {
      project_id: flags.project,
      assignee_id: flags.assignee,
      parent_task_id: flags.parent,
      is_done: flags.done ? true : flags.todo ? false : undefined,
      limit: Math.min(limit, 500),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/tasks', query),
      limit,
    )
    await this.outputResults(items, columns)
  }
}
