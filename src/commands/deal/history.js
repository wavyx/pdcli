import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { fetchChangelog } from '../../lib/changelog.js'

const columns = {
  time: { header: 'Time' },
  field_key: { header: 'Field' },
  old_value: { header: 'Old' },
  new_value: { header: 'New' },
  actor_user_id: { header: 'Actor' },
}

export default class DealHistoryCommand extends BaseCommand {
  static description =
    'Field-change history for a deal, newest-first (the API’s native order)'

  static examples = [
    '<%= config.bin %> deal history 42',
    '<%= config.bin %> deal history 42 --field stage_id',
    '<%= config.bin %> deal history 42 --limit 20 --output json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    field: Flags.string({
      description: 'Show only changes to this field key (e.g. stage_id)',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(DealHistoryCommand)

    let rows = await fetchChangelog(this.apiClient, args.id)

    if (flags.field) {
      rows = rows.filter((r) => r.field_key === flags.field)
    }
    if (flags.limit != null) {
      rows = rows.slice(0, flags.limit)
    }

    await this.outputResults(rows, columns)
  }
}
