import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { getFields, makeResolver } from '../../lib/fields.js'
import { CliError } from '../../lib/errors.js'

export default class FieldGetCommand extends BaseCommand {
  static description = 'Show one field by human name or hashed key'

  static examples = [
    '<%= config.bin %> field get deal "Deal Size"',
    '<%= config.bin %> field get deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12',
  ]

  static args = {
    entity: Args.string({
      required: true,
      description: 'Entity type',
      options: ['deal', 'person', 'org', 'organization', 'product', 'activity'],
    }),
    field: Args.string({
      required: true,
      description: 'Field name (human label) or hashed key',
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    const { args } = await this.parse(FieldGetCommand)

    const defs = await getFields(this.apiClient, args.entity)
    const resolver = makeResolver(defs)

    const key = resolver.nameToKey(args.field) ?? args.field
    const def = defs.find((d) => d.field_code === key)

    if (!def) {
      throw new CliError(
        `No field named or keyed "${args.field}" on ${args.entity}. ` +
          `Run: pdcli field list ${args.entity}`,
        { exitCode: 65 },
      )
    }

    await this.outputResults(def, {
      field_code: { header: 'Key' },
      field_name: { header: 'Name' },
      field_type: { header: 'Type' },
      options: {
        header: 'Options',
        get: (row) =>
          row.options?.map((o) => `${o.id}=${o.label}`).join(', ') ?? '',
      },
    })
  }
}
