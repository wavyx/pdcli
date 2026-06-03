import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields, outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class DealUpdateCommand extends BaseCommand {
  static description = 'Update a deal (v2 PATCH — only provided fields change)'

  static examples = [
    '<%= config.bin %> deal update 42 --stage 5',
    '<%= config.bin %> deal update 42 --status won',
    '<%= config.bin %> deal update 42 --field "Deal Size=Large"',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    title: Flags.string({ description: 'Deal title' }),
    value: Flags.integer({ description: 'Deal value' }),
    currency: Flags.string({ description: 'Deal currency (e.g. EUR)' }),
    status: Flags.string({
      description: 'Deal status',
      options: ['open', 'won', 'lost'],
    }),
    stage: Flags.integer({ description: 'Stage ID' }),
    pipeline: Flags.integer({ description: 'Pipeline ID' }),
    person: Flags.integer({ description: 'Linked person ID' }),
    org: Flags.integer({ description: 'Linked organization ID' }),
    owner: Flags.integer({ description: 'Owner (user) ID' }),
    probability: Flags.integer({ description: 'Success probability (0-100)' }),
    'expected-close-date': Flags.string({
      description: 'Expected close date (YYYY-MM-DD)',
    }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
  }

  async run() {
    const { args, flags } = await this.parse(DealUpdateCommand)

    const body = buildWriteBody({
      typed: {
        title: flags.title,
        value: flags.value,
        currency: flags.currency,
        status: flags.status,
        stage_id: flags.stage,
        pipeline_id: flags.pipeline,
        person_id: flags.person,
        org_id: flags.org,
        owner_id: flags.owner,
        probability: flags.probability,
        expected_close_date: flags['expected-close-date'],
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'deal', flags.field),
    })

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one field flag, --field, or --body',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.patch(`/api/v2/deals/${args.id}`, {
      body,
    })
    await outputRecord(this, res.data, 'deal')
  }
}
