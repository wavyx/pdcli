import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { clearFieldsCache, entityToFieldsPath } from '../../lib/fields.js'
import { CliError } from '../../lib/errors.js'

export default class FieldDeleteCommand extends BaseCommand {
  static description = 'Delete a custom field (data stored on records is lost)'

  static examples = [
    '<%= config.bin %> field delete deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12',
    '<%= config.bin %> field delete deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12 --yes',
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
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(FieldDeleteCommand)

    const ok = await confirmAction(
      `Delete field ${args.field} on ${args.entity}? ` +
        `All data stored in this field on existing records is lost.`,
      flags.yes,
      { default: false },
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    await this.apiClient.del(`${entityToFieldsPath(args.entity)}/${args.field}`)

    clearFieldsCache()

    await this.outputAction(
      { entity: args.entity, field: args.field, deleted: true },
      chalk.green(`Deleted field ${args.field} on ${args.entity}`),
    )
  }
}
