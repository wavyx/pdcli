import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { clearFieldsCache, entityToFieldsPath } from '../../../lib/fields.js'

export default class FieldOptionAddCommand extends BaseCommand {
  static description = 'Add an option to an enum/set custom field'

  static examples = [
    '<%= config.bin %> field option add deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12 --label "Critical"',
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
    label: Flags.string({
      required: true,
      description: 'Label for the new option',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(FieldOptionAddCommand)

    const res = await this.apiClient.post(
      `${entityToFieldsPath(args.entity)}/${args.field}/options`,
      { body: [{ label: flags.label }] },
    )

    // Option ids feed the per-run resolver — invalidate so the new option
    // resolves immediately within this process.
    clearFieldsCache()

    await this.outputResults(res.data ?? [], {
      id: { header: 'ID' },
      label: { header: 'Label' },
    })
  }
}
