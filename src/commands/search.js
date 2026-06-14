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

// Item types that have a dedicated v2 scoped-search endpoint (a wrapper of
// itemSearch with a narrower OAuth scope). Singular type → scoped endpoint path.
const SCOPED_PATHS = {
  deal: '/api/v2/deals/search',
  person: '/api/v2/persons/search',
  organization: '/api/v2/organizations/search',
  product: '/api/v2/products/search',
}

export default class SearchCommand extends BaseCommand {
  static description =
    'Search across deals, persons, organizations, products, leads, files, and projects'

  static examples = [
    '<%= config.bin %> search "acme"',
    '<%= config.bin %> search "acme" --item-types deal,person --output json',
    '<%= config.bin %> search "acme" --item-types deal --status open',
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
    status: Flags.string({
      description: 'Filter by deal status (only with --item-types deal)',
      options: ['open', 'won', 'lost'],
    }),
    person: Flags.integer({
      description: 'Filter by person ID (only with --item-types deal)',
    }),
    org: Flags.integer({
      description: 'Filter by organization ID (only with --item-types deal)',
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

    // A single routable item type uses the scoped endpoint; everything else
    // (multi-type, no type, or a non-routable type like lead/file) stays on
    // the generic itemSearch wrapper.
    const types = flags['item-types']
      ?.split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const scopedType =
      types?.length === 1 && SCOPED_PATHS[types[0]] ? types[0] : undefined

    // --status/--person/--org narrow deal searches only and are accepted only
    // when routing to the deals/search endpoint.
    if (
      (flags.status != null || flags.person != null || flags.org != null) &&
      scopedType !== 'deal'
    ) {
      throw new CliError(
        '--status, --person, and --org are valid only with --item-types deal',
        { exitCode: 64 },
      )
    }

    let body
    if (scopedType) {
      // Search costs 20 rate-limit tokens — single request, no auto-paging.
      body = await this.apiClient.get(SCOPED_PATHS[scopedType], {
        query: {
          term: args.term,
          exact_match: flags.exact ? true : undefined,
          status: scopedType === 'deal' ? flags.status : undefined,
          person_id: scopedType === 'deal' ? flags.person : undefined,
          organization_id: scopedType === 'deal' ? flags.org : undefined,
          // The per-entity /search endpoints cap limit at 100 (the live API
          // 400s on more, despite the 500 list cap — see src/lib/lookup.js).
          limit: flags.limit != null ? Math.min(flags.limit, 100) : undefined,
        },
      })
    } else {
      // Search costs 20 rate-limit tokens — single request, no auto-paging.
      body = await this.apiClient.get('/api/v2/itemSearch', {
        query: {
          term: args.term,
          item_types: flags['item-types'],
          exact_match: flags.exact ? true : undefined,
          limit: flags.limit,
        },
      })
    }

    const items = (body.data?.items ?? []).map((entry) => ({
      ...entry.item,
      result_score: entry.result_score,
    }))

    await this.outputResults(items, columns)
  }
}
