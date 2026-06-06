import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { clearFieldsCache, entityToFieldsPath } from '../../lib/fields.js'
import { CliError } from '../../lib/errors.js'

/** Option-bearing field types that require --options on creation. */
const OPTION_TYPES = new Set(['enum', 'set'])

export default class FieldCreateCommand extends BaseCommand {
  static description = 'Create a custom field on an entity'

  static examples = [
    '<%= config.bin %> field create deal --name "Budget" --type double',
    '<%= config.bin %> field create person --name "Tier" --type enum --options "Gold,Silver,Bronze"',
  ]

  static args = {
    entity: Args.string({
      required: true,
      description: 'Entity type',
      // Custom fields are writable on core v2 entities only — activity fields
      // are read-only, and lead/note have no v2 write path.
      options: ['deal', 'person', 'org', 'organization', 'product'],
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ required: true, description: 'Field name (label)' }),
    type: Flags.string({
      required: true,
      description: 'Field type (e.g. varchar, double, monetary, enum, set)',
    }),
    options: Flags.string({
      description: 'Comma-separated option labels (required for enum/set)',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(FieldCreateCommand)

    const isOptionType = OPTION_TYPES.has(flags.type)
    if (isOptionType && !flags.options) {
      throw new CliError(
        `Field type "${flags.type}" requires --options "A,B,C"`,
        { exitCode: 64 },
      )
    }

    const body = { field_name: flags.name, field_type: flags.type }
    if (isOptionType) {
      body.options = flags.options
        .split(',')
        .map((label) => ({ label: label.trim() }))
    }

    const path = entityToFieldsPath(args.entity)
    const res = await this.apiClient.post(path, { body })

    clearFieldsCache()

    await this.outputResults(res.data, {
      field_code: { header: 'Key' },
      field_name: { header: 'Name' },
      field_type: { header: 'Type' },
      options: {
        header: 'Options',
        get: (row) => row.options?.map((o) => `${o.id}=${o.label}`).join(', '),
      },
    })
  }
}
