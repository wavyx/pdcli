import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { getFields } from '../../lib/fields.js'

export default class FieldListCommand extends BaseCommand {
  static description =
    'List fields for an entity, including custom-field hash keys'

  static examples = [
    '<%= config.bin %> field list deal',
    '<%= config.bin %> field list person --output json',
  ]

  static args = {
    entity: Args.string({
      required: true,
      description: 'Entity type',
      options: ['deal', 'person', 'org', 'organization', 'product', 'activity'],
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { args } = await this.parse(FieldListCommand)

    const defs = await getFields(this.apiClient, args.entity)

    await this.outputResults(defs, {
      field_code: { header: 'Key' },
      field_name: { header: 'Name' },
      field_type: { header: 'Type' },
      options: {
        header: 'Options',
        get: (row) => row.options?.map((o) => o.label).join(', ') ?? '',
      },
    })
  }
}
