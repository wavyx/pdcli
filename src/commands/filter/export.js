import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'

/**
 * Reduce a full filter record to the create-compatible shape so exported
 * filters are git-diffable and portable across accounts.
 * @param {object} filter
 * @returns {{ name: string, type: string, conditions: unknown }}
 */
function toPortable(filter) {
  return {
    name: filter.name,
    type: filter.type,
    conditions: filter.conditions,
  }
}

export default class FilterExportCommand extends BaseCommand {
  static description =
    'Export a filter (or all filters) as portable {name, type, conditions} ' +
    'JSON. To recreate it, feed the fields to `filter create` separately ' +
    '(the create command takes --name/--type/--conditions, not one blob).'

  static examples = [
    '<%= config.bin %> filter export 5 > filter.json',
    '<%= config.bin %> filter export --all > filters.json',
    '# recreate on another account (conditions reference numeric field_id):\n' +
      '<%= config.bin %> filter create --name "$(jq -r .name filter.json)" ' +
      '--type "$(jq -r .type filter.json)" ' +
      '--conditions "$(jq -c .conditions filter.json)"',
  ]

  static args = {
    id: Args.integer({ description: 'Filter ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    all: Flags.boolean({ description: 'Export every filter' }),
  }

  async run() {
    const { args, flags } = await this.parse(FilterExportCommand)

    if (flags.all) {
      const list = await this.apiClient.get('/api/v1/filters')
      const out = []
      for (const summary of list.data ?? []) {
        const res = await this.apiClient.get(`/api/v1/filters/${summary.id}`)
        out.push(toPortable(res.data))
      }
      return this.emit(out)
    }

    if (args.id == null) {
      throw new CliError('Provide a filter ID or --all', { exitCode: 64 })
    }

    const res = await this.apiClient.get(`/api/v1/filters/${args.id}`)
    return this.emit(toPortable(res.data))
  }

  /**
   * Emit the portable payload as round-trippable JSON. --jq still applies so
   * exports can be sliced in a pipeline; otherwise raw pretty JSON is printed.
   * @param {unknown} payload
   */
  async emit(payload) {
    if (this.flags.jq) {
      await this.outputResults(payload, {})
      return
    }
    this.log(JSON.stringify(payload, null, 2))
  }
}
