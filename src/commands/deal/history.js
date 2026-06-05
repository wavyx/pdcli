import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { fetchChangelog } from '../../lib/changelog.js'
import { getFields, makeResolver } from '../../lib/fields.js'

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
    '<%= config.bin %> deal history 42 --limit 20 --resolve-fields',
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

    // A field filter drops rows client-side, so the fetch can't be bounded
    // by --limit in that case; otherwise cap the API page directly.
    const fetchLimit = flags.field ? undefined : flags.limit
    let rows = await fetchChangelog(this.apiClient, args.id, {
      limit: fetchLimit,
    })

    if (flags.field) {
      rows = rows.filter((r) => r.field_key === flags.field)
    }
    if (flags.limit != null) {
      rows = rows.slice(0, flags.limit)
    }

    // The Field column is the one place hash keys appear as DATA — resolve
    // them (and enum/set option ids) to names under --resolve-fields.
    if (flags['resolve-fields'] && rows.length > 0) {
      const resolver = makeResolver(await getFields(this.apiClient, 'deal'))
      // changelog values are stringified — option ids resolve numerically
      const label = (key, value) =>
        resolver.optionIdToLabel(key, Number(value)) ?? value
      rows = rows.map((r) => {
        const name = resolver.keyToName(r.field_key)
        if (!name) return r
        return {
          ...r,
          field_key: name,
          old_value: label(r.field_key, r.old_value),
          new_value: label(r.field_key, r.new_value),
        }
      })
    }

    await this.outputResults(rows, columns)
  }
}
