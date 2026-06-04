import { Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../../base-command.js'
import { resolveTargets, bulkRun } from '../../lib/bulk.js'
import { buildWriteBody } from '../../lib/input.js'
import { defsForFields } from '../../lib/entity-view.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

export default class DealBulkUpdateCommand extends BaseCommand {
  static description =
    'Update many deals at once (by --ids, a saved --filter, or ids piped on stdin)'

  static examples = [
    '<%= config.bin %> deal bulk-update --ids 1,2,3 --stage 5',
    '<%= config.bin %> deal bulk-update --filter 9 --status won',
    "<%= config.bin %> deal list --status open --jq '.[].id' | <%= config.bin %> deal bulk-update --owner 42",
    '<%= config.bin %> deal bulk-update --filter 9 --stage 5 --dry-run',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    ids: Flags.string({
      description: 'Comma-separated deal IDs',
      exclusive: ['filter'],
    }),
    filter: Flags.integer({
      description: 'Pipedrive saved filter ID to select deals',
      exclusive: ['ids'],
    }),
    stage: Flags.integer({ description: 'Move to stage ID' }),
    pipeline: Flags.integer({ description: 'Move to pipeline ID' }),
    status: Flags.string({
      description: 'Set status',
      options: ['open', 'won', 'lost'],
    }),
    owner: Flags.integer({ description: 'Assign owner (user) ID' }),
    field: Flags.string({
      multiple: true,
      description: 'Custom/standard field as "Name=Value" (repeatable)',
    }),
    body: Flags.string({ description: 'Raw JSON body to merge (flags win)' }),
    'dry-run': Flags.boolean({
      description: 'List the targets without updating anything',
      default: false,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(DealBulkUpdateCommand)

    const body = buildWriteBody({
      typed: {
        stage_id: flags.stage,
        pipeline_id: flags.pipeline,
        status: flags.status,
        owner_id: flags.owner,
      },
      fields: flags.field,
      rawBody: flags.body,
      defs: await defsForFields(this, 'deal', flags.field),
    })

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass at least one change flag, --field, or --body',
        { exitCode: 64 },
      )
    }

    const targets = await resolveTargets(
      { ids: flags.ids, filter: flags.filter },
      this.apiClient,
      '/api/v2/deals',
    )

    if (flags['dry-run']) {
      this.log(
        `Would update ${chalk.bold(targets.length)} deals: ${targets.join(', ')}`,
      )
      this.log(chalk.dim(`Change: ${JSON.stringify(body)}`))
      return
    }

    const ok = await confirmAction(
      `Update ${targets.length} deals with ${JSON.stringify(body)}?`,
      flags.yes,
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    const spinner = ora(`Updating ${targets.length} deals...`).start()
    let summary
    try {
      summary = await bulkRun(
        targets,
        (id) => this.apiClient.patch(`/api/v2/deals/${id}`, { body }),
        {
          onProgress: (done, total) => {
            spinner.text = `Updating deals ${done}/${total}`
          },
        },
      )
    } finally {
      spinner.stop()
    }

    this.log(
      chalk.green(
        `Updated ${summary.succeeded.length}/${targets.length} deals`,
      ),
    )

    if (summary.failed.length > 0) {
      for (const { item, error } of summary.failed) {
        this.log(chalk.red(`  ✘ deal ${item}: ${error}`))
      }
      throw new CliError(
        `${summary.failed.length} of ${targets.length} updates failed`,
        { exitCode: 1 },
      )
    }
  }
}
