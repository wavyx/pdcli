import BaseCommand from '../../base-command.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  email: { header: 'Email' },
  active_flag: {
    header: 'Active',
    get: (row) => (row.active_flag ? 'yes' : 'no'),
  },
  is_admin: { header: 'Admin' },
}

export default class UserListCommand extends BaseCommand {
  static description = 'List all users'

  static examples = [
    '<%= config.bin %> user list',
    '<%= config.bin %> user list --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { flags } = await this.parse(UserListCommand)

    // Users API is v1-only and returns every user in one unpaginated array.
    const body = await this.apiClient.get('/api/v1/users')
    let users = body.data ?? []
    if (flags.limit) users = users.slice(0, flags.limit)

    await this.outputResults(users, columns)
  }
}
