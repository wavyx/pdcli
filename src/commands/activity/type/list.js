import BaseCommand from '../../../base-command.js'

const columns = {
  id: { header: 'ID' },
  key_string: { header: 'Key' },
  name: { header: 'Name' },
  active: {
    header: 'Active',
    get: (row) => (row.active_flag ? 'yes' : 'no'),
  },
}

export default class ActivityTypeListCommand extends BaseCommand {
  static description =
    'List activity types. The Key (key_string) is what `activity --type` takes.'

  static examples = [
    '<%= config.bin %> activity type list',
    '<%= config.bin %> activity type list --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { flags } = await this.parse(ActivityTypeListCommand)

    // Activity types are v1-only and returned in one unpaginated array.
    const body = await this.apiClient.get('/api/v1/activityTypes')
    let types = body.data ?? []
    if (flags.limit) types = types.slice(0, flags.limit)

    await this.outputResults(types, columns)
  }
}
