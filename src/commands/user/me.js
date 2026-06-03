import BaseCommand from '../../base-command.js'

export default class UserMeCommand extends BaseCommand {
  static description = 'Show the authenticated user'

  static examples = ['<%= config.bin %> user me']

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    await this.parse(UserMeCommand)

    // Users API is v1-only (no v2 equivalent as of June 2026).
    const body = await this.apiClient.get('/api/v1/users/me')

    await this.outputResults(body.data, {
      id: { header: 'ID' },
      name: { header: 'Name' },
      email: { header: 'Email' },
      is_admin: { header: 'Admin' },
      timezone_name: { header: 'Timezone' },
    })
  }
}
