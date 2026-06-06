import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { clearFieldsCache, entityToFieldsPath } from '../../lib/fields.js'

export default class FieldUpdateCommand extends BaseCommand {
  static description =
    'Update a custom field (field_code and field_type cannot change)'

  static examples = [
    '<%= config.bin %> field update deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12 --name "New name"',
  ]

  static args = {
    entity: Args.string({
      required: true,
      description: 'Entity type',
      options: ['deal', 'person', 'org', 'organization', 'product'],
    }),
    field: Args.string({
      required: true,
      description: 'Field code (hashed key)',
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({
      required: true,
      description: 'New field name (label)',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(FieldUpdateCommand)

    const path = `${entityToFieldsPath(args.entity)}/${args.field}`
    const res = await this.apiClient.patch(path, {
      body: { field_name: flags.name },
    })

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
