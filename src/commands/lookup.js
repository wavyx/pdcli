import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { CliError } from '../lib/errors.js'
import { getFields, makeResolver } from '../lib/fields.js'

// User-facing entity -> itemSearch/field entity_type. Only entities that have
// both a fields endpoint (for name->key resolution) and a searchable type are
// supported; `project` is intentionally omitted (no fields endpoint).
const ENTITY_TYPES = {
  deal: 'deal',
  person: 'person',
  org: 'organization',
  product: 'product',
  lead: 'lead',
}

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name / Title', get: (row) => row.title ?? row.name ?? '' },
}

export default class LookupCommand extends BaseCommand {
  static description =
    'Find item IDs by an exact field value — the create-vs-update primitive.\n' +
    'Matching is CASE-SENSITIVE, and the search index is eventually consistent ' +
    '(a just-created record is not immediately findable), so a lookup-then-create ' +
    'loop can double-create in fast pipelines. Exit 3 means no match (branch to ' +
    'create); exit 0 with rows means it exists.'

  static examples = [
    '<%= config.bin %> lookup deal --field "PO Number" --value PO-1234',
    '<%= config.bin %> lookup person --field Email --value a@b.com --first --jq .id',
    '<%= config.bin %> lookup org --field Name --value Acme --match beginning',
  ]

  static args = {
    entity: Args.string({
      required: true,
      description: 'Item type to search',
      options: Object.keys(ENTITY_TYPES),
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    field: Flags.string({
      required: true,
      description: 'Field name (built-in or custom) to search on',
    }),
    value: Flags.string({
      required: true,
      description: 'Value to match against the field',
    }),
    match: Flags.string({
      description: 'Match mode (case-sensitive)',
      options: ['exact', 'beginning', 'middle'],
      default: 'exact',
    }),
    first: Flags.boolean({
      description: 'Return only the first match (a single object)',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(LookupCommand)
    const entityType = ENTITY_TYPES[args.entity]

    const resolver = makeResolver(await getFields(this.apiClient, args.entity))
    const field = resolver.nameToKey(flags.field)
    if (!field) {
      throw new CliError(`Unknown field "${flags.field}" for ${args.entity}`, {
        exitCode: 64,
      })
    }

    // exact match allows a 1-char term; the other modes need at least 2.
    const minLength = flags.match === 'exact' ? 1 : 2
    if (flags.value.length < minLength) {
      throw new CliError(
        `--value must be at least ${minLength} character(s) for --match ${flags.match}`,
        { exitCode: 64 },
      )
    }

    // Search costs 20 rate-limit tokens; the field-search endpoint caps limit
    // at 100 (single request, no auto-paging).
    const body = await this.apiClient.get('/api/v2/itemSearch/field', {
      query: {
        term: flags.value,
        entity_type: entityType,
        field,
        match: flags.match,
        limit: flags.limit != null ? Math.min(flags.limit, 100) : undefined,
      },
    })

    // Each result wraps the matched record under `item`; tolerate a flat shape
    // (`{ id, ... }` directly) so the no-match check and output stay correct
    // whichever the live endpoint returns.
    const rows = (body.data ?? []).map((entry) => entry.item ?? entry)

    if (rows.length === 0) {
      throw new CliError(
        `No ${args.entity} found where ${flags.field} = ${flags.value}`,
        { exitCode: 3 },
      )
    }

    await this.outputResults(flags.first ? rows[0] : rows, columns)
  }
}
