import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class TaskUpdateCommand extends BaseCommand {
  static description = 'Update a task (v2 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> task update 7 --title "Renamed"',
    '<%= config.bin %> task update 7 --done',
    '<%= config.bin %> task update 7 --assignee 9',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Task ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    title: Flags.string({ description: 'Task title' }),
    project: Flags.integer({ description: 'Project ID' }),
    description: Flags.string({ description: 'Task description' }),
    assignee: Flags.integer({ description: 'Assignee (user) ID' }),
    'due-date': Flags.string({ description: 'Due date (YYYY-MM-DD)' }),
    parent: Flags.integer({ description: 'Parent task ID' }),
    done: Flags.boolean({
      description: 'Mark the task as done',
      exclusive: ['undone'],
    }),
    undone: Flags.boolean({
      description: 'Mark the task as not done',
      exclusive: ['done'],
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { args, flags } = await this.parse(TaskUpdateCommand)

    // The v2 task body takes `done` as an integer enum (0 = not done, 1 = done).
    let done
    if (flags.done) done = 1
    else if (flags.undone) done = 0

    const body = buildWriteBody({
      typed: {
        title: flags.title,
        project_id: flags.project,
        description: flags.description,
        assignee_id: flags.assignee,
        due_date: flags['due-date'],
        parent_task_id: flags.parent,
        done,
      },
      rawBody: flags.body,
    })

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.patch(`/api/v2/tasks/${args.id}`, {
      body,
    })
    await outputRecord(this, res.data)
  }
}
