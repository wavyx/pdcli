import { Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../../base-command.js'
import { runWarehouseSync } from '../../lib/warehouse.js'
import { resolveSince } from '../../lib/period.js'

export default class SyncWarehouseCommand extends BaseCommand {
  static description =
    'Incremental NDJSON export for a data warehouse: appends only records ' +
    'changed since the last run, per-entity, with high-water marks in ' +
    'manifest.json. First run seeds a full export. NOTE: pull-based CDC sees ' +
    'creates/updates only — hard deletes are not captured; reconcile against a ' +
    'periodic full `backup`.'

  static examples = [
    '<%= config.bin %> sync warehouse --dir ./warehouse',
    '<%= config.bin %> sync warehouse --dir ./warehouse --since 7d',
    '<%= config.bin %> sync warehouse --dir ./warehouse --full',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    dir: Flags.string({
      description: 'Output directory for the NDJSON files + manifest',
      default: 'pipedrive-warehouse',
    }),
    since: Flags.string({
      description: 'Override the start for all entities (RFC3339 or Nd/Nm)',
    }),
    full: Flags.boolean({
      description:
        'Ignore watermarks and rebuild from scratch (truncates files)',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(SyncWarehouseCommand)
    const now = new Date()
    const since =
      flags.since != null ? resolveSince(flags.since, now) : undefined

    const spinner = ora('Syncing to warehouse...').start()
    let result
    try {
      result = await runWarehouseSync(this.apiClient, flags.dir, {
        since,
        full: flags.full,
        onProgress: (entity, count) => {
          spinner.text = `${entity}: ${count}`
        },
      })
    } finally {
      spinner.stop()
    }

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(result, {})
      return
    }

    const total = Object.values(result.counts).reduce((a, b) => a + b, 0)
    this.log(chalk.green(`Synced ${total} records to ${flags.dir}`))
    for (const entity of result.entities) {
      this.log(`  ${entity}: ${result.counts[entity]}`)
    }
  }
}
