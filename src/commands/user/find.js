import { Args, Flags } from '@oclif/core'
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

export default class UserFindCommand extends BaseCommand {
  static description = 'Find users by name'

  static examples = [
    '<%= config.bin %> user find "jane"',
    '<%= config.bin %> user find "jane@acme.com" --by-email --output json',
  ]

  static args = {
    term: Args.string({ required: true, description: 'Search term' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    'by-email': Flags.boolean({
      description: 'Match the term against email addresses only',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(UserFindCommand)

    // Users API is v1-only; /users/find returns one unpaginated array.
    const body = await this.apiClient.get('/api/v1/users/find', {
      query: {
        term: args.term,
        search_by_email: flags['by-email'] ? 1 : undefined,
      },
    })
    let users = body.data ?? []
    if (flags.limit) users = users.slice(0, flags.limit)

    await this.outputResults(users, columns)
  }
}
