import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { getFields, makeResolver } from '../../lib/fields.js'
import { flattenRecord } from '../../lib/output/record.js'

export default class DealGetCommand extends BaseCommand {
  static description = 'Get a deal by ID'

  static examples = [
    '<%= config.bin %> deal get 42',
    '<%= config.bin %> deal get 42 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  async run() {
    const { args } = await this.parse(DealGetCommand)
    const body = await this.apiClient.get(`/api/v2/deals/${args.id}`)
    let record = body.data

    if (this.resolveFormat() === 'table') {
      // Table view resolves custom-field hash keys to names and option IDs
      // to labels; JSON output stays raw for scripting.
      if (record.custom_fields && Object.keys(record.custom_fields).length) {
        const defs = await getFields(this.apiClient, 'deal')
        record = makeResolver(defs).resolveCustomFields(record)
      }
      await this.outputResults(flattenRecord(record), {
        field: { header: 'Field' },
        value: { header: 'Value' },
      })
      return
    }

    await this.outputResults(record, {})
  }
}
