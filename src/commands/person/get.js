import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { getFields, makeResolver } from '../../lib/fields.js'
import { flattenRecord } from '../../lib/output/record.js'

export default class PersonGetCommand extends BaseCommand {
  static description = 'Get a person by ID'

  static examples = [
    '<%= config.bin %> person get 5',
    '<%= config.bin %> person get 5 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Person ID' }),
  }

  async run() {
    const { args } = await this.parse(PersonGetCommand)
    const body = await this.apiClient.get(`/api/v2/persons/${args.id}`)
    let record = body.data

    if (this.resolveFormat() === 'table') {
      if (record.custom_fields && Object.keys(record.custom_fields).length) {
        const defs = await getFields(this.apiClient, 'person')
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
