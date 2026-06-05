import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

const columns = {
  id: { header: 'ID' },
  subject: { header: 'Subject' },
  type: { header: 'Type' },
  due_date: { header: 'Due' },
  done: { header: 'Done' },
  deal_id: { header: 'Deal' },
  owner_id: { header: 'Owner' },
}

export default class ActivityListCommand extends BaseCommand {
  static description = 'List activities'

  static examples = [
    '<%= config.bin %> activity list',
    '<%= config.bin %> activity list --todo --deal 42',
    '<%= config.bin %> activity list --type call --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    owner: Flags.integer({ description: 'Filter by owner (user) ID' }),
    deal: Flags.integer({ description: 'Filter by deal ID' }),
    person: Flags.integer({ description: 'Filter by person ID' }),
    org: Flags.integer({ description: 'Filter by organization ID' }),
    type: Flags.string({ description: 'Filter by activity type key' }),
    done: Flags.boolean({
      description: 'Only completed activities',
      exclusive: ['todo'],
    }),
    todo: Flags.boolean({
      description: 'Only open (not done) activities',
      exclusive: ['done'],
    }),
  }

  async run() {
    const { flags } = await this.parse(ActivityListCommand)
    const limit = flags.limit ?? 100

    const query = {
      owner_id: flags.owner,
      deal_id: flags.deal,
      person_id: flags.person,
      org_id: flags.org,
      type: flags.type,
      done: flags.done ? true : flags.todo ? false : undefined,
      limit: Math.min(limit, 100),
    }

    const items = await collectPages(
      this.apiClient.pageV2('/api/v2/activities', query),
      limit,
    )
    await this.outputResults(items, columns, { entity: 'activity' })
  }
}
