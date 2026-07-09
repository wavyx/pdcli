import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolveBody } from '../../lib/body.js'
import { outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

const TYPES = [
  'deals',
  'leads',
  'org',
  'people',
  'products',
  'activity',
  'projects',
]

export default class FilterCreateCommand extends BaseCommand {
  static description = 'Create a filter'

  static examples = [
    '<%= config.bin %> filter create --name "Open deals" --type deals --conditions @conditions.json',
    'cat conditions.json | <%= config.bin %> filter create --name "Open deals" --type deals',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ required: true, description: 'Filter name' }),
    type: Flags.string({
      required: true,
      description: 'Filter type',
      options: TYPES,
    }),
    conditions: Flags.string({
      description:
        'Conditions JSON (a value, @file, or piped stdin). Fields are ' +
        'referenced by numeric field_id — run `pdcli filter helpers` for the ' +
        'valid operators. The blob needs the two-level glue structure ' +
        '{"glue":"and","conditions":[{"glue":"and",...},{"glue":"or",...}]}.',
    }),
  }

  async run() {
    const { flags } = await this.parse(FilterCreateCommand)

    const raw = await resolveBody({ body: flags.conditions })
    let conditions
    try {
      conditions = JSON.parse(raw)
    } catch (err) {
      throw new CliError(`--conditions is not valid JSON: ${err.message}`, {
        exitCode: 65,
      })
    }

    const res = await this.apiClient.post('/api/v1/filters', {
      body: { name: flags.name, type: flags.type, conditions },
    })
    await outputRecord(this, res.data)
  }
}
