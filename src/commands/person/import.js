import { readFileSync } from 'node:fs'
import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../../base-command.js'
import { parseCsv } from '../../lib/csv-parse.js'
import { prepareImportBodies } from '../../lib/import.js'
import { bulkRun } from '../../lib/bulk.js'
import { getFields } from '../../lib/fields.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

const SPECIAL_COLUMNS = {
  name: (typed, value) => {
    typed.name = value
  },
  email: (typed, value) => {
    typed.emails = [{ value, primary: true }]
  },
  phone: (typed, value) => {
    typed.phones = [{ value, primary: true }]
  },
  org_id: (typed, value) => {
    typed.org_id = Number(value)
  },
  owner_id: (typed, value) => {
    typed.owner_id = Number(value)
  },
}

export default class PersonImportCommand extends BaseCommand {
  static description =
    'Bulk-create persons from a CSV (headers map to fields, custom fields by name)'

  static examples = [
    '<%= config.bin %> person import people.csv',
    '<%= config.bin %> person import people.csv --dry-run',
  ]

  static args = {
    file: Args.string({ required: true, description: 'CSV file path' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
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
    const { args, flags } = await this.parse(PersonImportCommand)

    const { headers, rows } = parseCsv(readFileSync(args.file, 'utf8'))
    if (!headers.some((h) => h.toLowerCase() === 'name')) {
      throw new CliError('CSV must include a "name" column', { exitCode: 64 })
    }

    const needsDefs = headers.some((h) => !(h.toLowerCase() in SPECIAL_COLUMNS))
    const bodies = prepareImportBodies({
      headers,
      rows,
      specialColumns: SPECIAL_COLUMNS,
      defs: needsDefs ? await getFields(this.apiClient, 'person') : [],
    })

    if (flags['dry-run']) {
      this.log(chalk.green(`${bodies.length} rows valid — nothing created`))
      return
    }

    const ok = await confirmAction(
      `Create ${bodies.length} persons from ${args.file}?`,
      flags.yes,
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    const spinner = ora(`Importing ${bodies.length} persons...`).start()
    let summary
    try {
      summary = await bulkRun(
        bodies,
        (body) => this.apiClient.post('/api/v2/persons', { body }),
        {
          onProgress: (done, total) => {
            spinner.text = `Importing persons ${done}/${total}`
          },
        },
      )
    } finally {
      spinner.stop()
    }

    this.log(
      chalk.green(
        `Imported ${summary.succeeded.length}/${bodies.length} persons`,
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
}
