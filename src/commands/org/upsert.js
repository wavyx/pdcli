import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { upsertWithDefs, summarizeUpsert } from '../../lib/upsert.js'

export default class OrgUpsertCommand extends BaseCommand {
  static description =
    'Idempotent organization upsert: match by --by, then create or PATCH only ' +
    'the changed fields. Refuses (exit 65) if more than one record matches.'

  static examples = [
    '<%= config.bin %> org upsert Acme --by name --field "Tier=Gold"',
    '<%= config.bin %> org upsert "D-42" --by "External ID" --body \'{"owner_id":42}\'',
    '<%= config.bin %> org upsert Acme --by name --field "Tier=Gold" --dry-run',
  ]

  static args = {
    value: Args.string({ required: true, description: 'value to match on' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    by: Flags.string({
      required: true,
      description: 'Match field: name, or a searchable custom field',
    }),
    field: Flags.string({
      multiple: true,
      description: 'Field to set as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge' }),
    'dry-run': Flags.boolean({
      description: 'Preview the action without writing',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(OrgUpsertCommand)
    const result = await upsertWithDefs({
      client: this.apiClient,
      entity: 'org',
      by: flags.by,
      value: args.value,
      fields: flags.field,
      rawBody: flags.body,
      dryRun: flags['dry-run'],
    })

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(result, {})
      return
    }
    this.log(summarizeUpsert(result, 'org'))
  }
}
