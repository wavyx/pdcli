import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class TaskCreateCommand extends BaseCommand {
  static description = 'Create a task'

  static examples = [
    '<%= config.bin %> task create --title "Write spec" --project 3',
    '<%= config.bin %> task create --title "Subtask" --project 3 --parent 5 --assignee 7',
    '<%= config.bin %> task create --title "Raw" --project 3 --body \'{"priority":5}\'',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    title: Flags.string({ required: true, description: 'Task title' }),
    project: Flags.integer({ required: true, description: 'Project ID' }),
    description: Flags.string({ description: 'Task description' }),
    assignee: Flags.integer({ description: 'Assignee (user) ID' }),
    'due-date': Flags.string({ description: 'Due date (YYYY-MM-DD)' }),
    parent: Flags.integer({ description: 'Parent task ID' }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { flags } = await this.parse(TaskCreateCommand)

    const body = buildWriteBody({
      typed: {
        title: flags.title,
        project_id: flags.project,
        description: flags.description,
        assignee_id: flags.assignee,
        due_date: flags['due-date'],
        parent_task_id: flags.parent,
      },
      rawBody: flags.body,
    })

    const res = await this.apiClient.post('/api/v2/tasks', { body })
    await outputRecord(this, res.data)
  }
}
