import { readFileSync } from 'node:fs'
import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../../base-command.js'
import { parseCsv } from '../../lib/csv-parse.js'
import { prepareImportBodies } from '../../lib/import.js'
import { bulkRun } from '../../lib/bulk.js'
import { bulkUpsertRows } from '../../lib/upsert.js'
import { getFields } from '../../lib/fields.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

const SPECIAL_COLUMNS = {
  name: (typed, value) => {
    typed.name = value
  },
  owner_id: (typed, value) => {
    typed.owner_id = Number(value)
  },
}

export default class OrgImportCommand extends BaseCommand {
  static description =
    'Bulk-create organizations from a CSV (headers map to fields, custom fields by name)'

  static examples = [
    '<%= config.bin %> org import orgs.csv',
    '<%= config.bin %> org import orgs.csv --dry-run',
  ]

  static args = {
    file: Args.string({ required: true, description: 'CSV file path' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    upsert: Flags.boolean({
      description: 'Match each row on --match-on, then create or update',
      default: false,
    }),
    'match-on': Flags.string({
      description: 'Field to match rows on in --upsert mode (e.g. name)',
    }),
    'dry-run': Flags.boolean({
      description: 'Validate every row without creating anything',
      default: false,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(OrgImportCommand)

    const { headers, rows } = parseCsv(readFileSync(args.file, 'utf8'))
    if (!headers.some((h) => h.toLowerCase() === 'name')) {
      throw new CliError('CSV must include a "name" column', { exitCode: 64 })
    }

    let matchIdx
    if (flags.upsert) {
      if (!flags['match-on']) {
        throw new CliError('--upsert requires --match-on <field>', {
          exitCode: 64,
        })
      }
      matchIdx = headers.findIndex(
        (h) => h.toLowerCase() === flags['match-on'].toLowerCase(),
      )
      if (matchIdx < 0) {
        throw new CliError(
          `--match-on "${flags['match-on']}" is not a column in ${args.file}`,
          { exitCode: 64 },
        )
      }
    }

    const needsDefs = headers.some((h) => !(h.toLowerCase() in SPECIAL_COLUMNS))
    const defs =
      needsDefs || flags.upsert ? await getFields(this.apiClient, 'org') : []
    const bodies = prepareImportBodies({
      headers,
      rows,
      specialColumns: SPECIAL_COLUMNS,
      defs,
    })

    if (flags.upsert) {
      await this.upsertRows({ args, flags, rows, bodies, matchIdx, defs })
      return
    }

    if (flags['dry-run']) {
      this.log(chalk.green(`${bodies.length} rows valid — nothing created`))
      return
    }

    const ok = await confirmAction(
      `Create ${bodies.length} organizations from ${args.file}?`,
      flags.yes,
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    const spinner = ora(`Importing ${bodies.length} organizations...`).start()
    let summary
    try {
      summary = await bulkRun(
        bodies,
        (body) => this.apiClient.post('/api/v2/organizations', { body }),
        {
          onProgress: (done, total) => {
            spinner.text = `Importing organizations ${done}/${total}`
          },
        },
      )
    } finally {
      spinner.stop()
    }

    this.log(
      chalk.green(
        `Imported ${summary.succeeded.length}/${bodies.length} organizations`,
      ),
    )

    if (summary.failed.length > 0) {
      for (const { item, error } of summary.failed) {
        this.log(chalk.red(`  ✘ ${item.name ?? '(unnamed)'}: ${error}`))
      }
      throw new CliError(
        `${summary.failed.length} of ${bodies.length} rows failed`,
        { exitCode: 1 },
      )
    }
  }

  /** Idempotent CSV path: match each row on --match-on, then create or PATCH. */
  async upsertRows({ args, flags, rows, bodies, matchIdx, defs }) {
    const matchOn = flags['match-on']
    const items = bodies.map((body, i) => ({ body, value: rows[i][matchIdx] }))

    if (!flags['dry-run']) {
      const ok = await confirmAction(
        `Upsert ${items.length} organizations from ${args.file} (match on ${matchOn})?`,
        flags.yes,
      )
      if (!ok) {
        throw new CliError('Aborted', { exitCode: 1 })
      }
    }

    const spinner = ora(`Upserting ${items.length} organizations...`).start()
    let summary
    try {
      summary = await bulkUpsertRows({
        client: this.apiClient,
        entity: 'org',
        matchOn,
        rows: items,
        defs,
        dryRun: flags['dry-run'],
        onProgress: (done, total) => {
          spinner.text = `Upserting organizations ${done}/${total}`
        },
      })
    } finally {
      spinner.stop()
    }

    const { created, updated, unchanged } = summary.counts
    const prefix = flags['dry-run'] ? '[dry-run] ' : ''
    this.log(
      chalk.green(
        `${prefix}${created} created, ${updated} updated, ${unchanged} unchanged`,
      ),
    )

    if (summary.failed.length > 0) {
      for (const { item, error } of summary.failed) {
        this.log(chalk.red(`  ✘ ${matchOn}="${item.value}": ${error}`))
      }
      throw new CliError(
        `${summary.failed.length} of ${items.length} rows failed`,
        { exitCode: 1 },
      )
    }
  }
}
