import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { CliError } from '../lib/errors.js'

const columns = {
  type: { header: 'Type' },
  id: { header: 'ID' },
  name: {
    header: 'Name / Title',
    get: (row) => row.title ?? row.name ?? '',
  },
}

export default class SearchCommand extends BaseCommand {
  static description =
    'Search across deals, persons, organizations, products, leads, files, and projects'

  static examples = [
    '<%= config.bin %> search "acme"',
    '<%= config.bin %> search "acme" --item-types deal,person --output json',
  ]

  static args = {
    term: Args.string({ required: true, description: 'Search term' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    'item-types': Flags.string({
      description:
        'Comma-separated item types (deal,person,organization,product,lead,file,mail_attachment,project)',
    }),
    exact: Flags.boolean({
      description: 'Exact match (allows 1-character terms)',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(SearchCommand)

    const minLength = flags.exact ? 1 : 2
    if (args.term.length < minLength) {
      throw new CliError(
        `Search term must be at least 2 characters (1 with --exact)`,
        { exitCode: 64 },
      )
    }

    // Search costs 40 rate-limit tokens — single request, no auto-paging.
    const body = await this.apiClient.get('/api/v2/itemSearch', {
      query: {
        term: args.term,
        item_types: flags['item-types'],
        exact_match: flags.exact ? true : undefined,
        limit: flags.limit,
      },
    })

    const items = (body.data?.items ?? []).map((entry) => ({
      ...entry.item,
      result_score: entry.result_score,
    }))

    await this.outputResults(items, columns)
  }
}
