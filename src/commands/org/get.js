import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { getFields, makeResolver } from '../../lib/fields.js'
import { flattenRecord } from '../../lib/output/record.js'

export default class OrgGetCommand extends BaseCommand {
  static description = 'Get an organization by ID'

  static examples = [
    '<%= config.bin %> org get 7',
    '<%= config.bin %> org get 7 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.integer({ required: true, description: 'Organization ID' }),
  }

  async run() {
    const { args } = await this.parse(OrgGetCommand)
    const body = await this.apiClient.get(`/api/v2/organizations/${args.id}`)
    let record = body.data

    if (this.resolveFormat() === 'table') {
      if (record.custom_fields && Object.keys(record.custom_fields).length) {
        const defs = await getFields(this.apiClient, 'org')
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
