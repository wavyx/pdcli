import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'

const columns = {
  type: { header: 'Field type' },
  operator: { header: 'Operator' },
  meaning: { header: 'Meaning' },
}

/**
 * Flatten the helpers `operators` map into type/operator/meaning rows.
 * Most entries are `{ operator: label }` maps; the `enum` group is instead an
 * array of single-key `{ operator: label }` objects, so both shapes are
 * handled here.
 * @param {Record<string, unknown>} operators
 * @param {string} [typeFilter] only emit rows for this field data type
 * @returns {{ type: string, operator: string, meaning: string }[]}
 */
function flattenOperators(operators, typeFilter) {
  const rows = []
  for (const [type, ops] of Object.entries(operators ?? {})) {
    if (typeFilter && type !== typeFilter) continue
    const entries = Array.isArray(ops)
      ? ops.flatMap((o) => Object.entries(o))
      : Object.entries(ops)
    for (const [operator, meaning] of entries) {
      rows.push({ type, operator, meaning })
    }
  }
  return rows
}

export default class FilterHelpersCommand extends BaseCommand {
  static description =
    'List the operators available for authoring filter conditions'

  static examples = [
    '<%= config.bin %> filter helpers',
    '<%= config.bin %> filter helpers --type varchar',
    '<%= config.bin %> filter helpers --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    type: Flags.string({
      description:
        'Only show operators for this field data type (e.g. varchar, date, int)',
    }),
  }

  async run() {
    const { flags } = await this.parse(FilterHelpersCommand)

    const body = await this.apiClient.get('/api/v1/filters/helpers')
    const rows = flattenOperators(body.data?.operators, flags.type)
    await this.outputResults(rows, columns)
  }
}
