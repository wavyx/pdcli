import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import { confirmAction } from '../../../lib/confirm.js'
import { clearFieldsCache, entityToFieldsPath } from '../../../lib/fields.js'
import { CliError } from '../../../lib/errors.js'

export default class FieldOptionRemoveCommand extends BaseCommand {
  static description =
    'Remove an option from an enum/set custom field (records lose the value)'

  static examples = [
    '<%= config.bin %> field option remove deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12 --option 4',
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
    option: Flags.string({
      required: true,
      description: 'Option ID to remove (see field get)',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(FieldOptionRemoveCommand)

    const optionId = Number(flags.option)
    if (!Number.isInteger(optionId)) {
      throw new CliError(`Invalid option id: "${flags.option}"`, {
        exitCode: 64,
      })
    }

    const ok = await confirmAction(
      `Remove option ${optionId} from field ${args.field} on ${args.entity}? ` +
        `Records using it lose the value.`,
      flags.yes,
      { default: false },
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    const res = await this.apiClient.del(
      `${entityToFieldsPath(args.entity)}/${args.field}/options`,
      { body: [{ id: optionId }] },
    )

    clearFieldsCache()

    await this.outputResults(res.data ?? [], {
      id: { header: 'ID' },
      label: { header: 'Label' },
    })
  }
}
