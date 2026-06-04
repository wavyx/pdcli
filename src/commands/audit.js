import { Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../base-command.js'
import { collectPages } from '../lib/pagination.js'
import { runChecks, AUDIT_CHECKS } from '../lib/audit.js'
import { CliError } from '../lib/errors.js'

export default class AuditCommand extends BaseCommand {
  static description =
    'Data-quality audit: stale deals, missing fields, duplicates, overdue pileups'

  static examples = [
    '<%= config.bin %> audit',
    '<%= config.bin %> audit --checks stale-deals,duplicate-persons --verbose',
    '<%= config.bin %> audit --strict   # exit 1 on must-severity findings (CI)',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    checks: Flags.string({
      description: `Comma-separated subset of checks (${AUDIT_CHECKS.map((c) => c.name).join(', ')})`,
    }),
    strict: Flags.boolean({
      description: 'Exit 1 when any must-severity check has findings',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(AuditCommand)
    const now = new Date()

    const only = flags.checks?.split(',').map((c) => c.trim())
    if (only) {
      const known = new Set(AUDIT_CHECKS.map((c) => c.name))
      const bad = only.filter((c) => !known.has(c))
      if (bad.length > 0) {
        throw new CliError(
          `Unknown check${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}. ` +
            `Valid: ${[...known].join(', ')}`,
          { exitCode: 64 },
        )
      }
    }

    const spinner = ora('Fetching account data...').start()
    let data
    try {
      // v2 has no all_not_deleted status — fetch the three states separately.
      const [open, won, lost, persons, organizations, activities] =
        await Promise.all([
          collectPages(
            this.apiClient.pageV2('/api/v2/deals', {
              status: 'open',
              limit: 500,
            }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/deals', {
              status: 'won',
              limit: 500,
            }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/deals', {
              status: 'lost',
              limit: 500,
            }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/persons', { limit: 500 }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/organizations', { limit: 500 }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/activities', { limit: 500 }),
          ),
        ])
      data = {
        deals: [...open, ...won, ...lost],
        persons,
        organizations,
        activities,
      }
    } finally {
      spinner.stop()
    }

    const results = runChecks(data, { now, only })

    if (this.resolveFormat() === 'table') {
      await this.outputResults(results, {
        severity: {
          header: 'Sev',
          get: (row) => (row.severity === 'must' ? '●' : '○'),
        },
        title: { header: 'Check' },
        count: {
          header: 'Findings',
          get: (row) =>
            row.count === 0
              ? chalk.green('0')
              : chalk.yellow(String(row.count)),
        },
      })
      if (this.flags.verbose) {
        for (const result of results.filter((r) => r.count > 0)) {
          this.log('')
          this.log(chalk.bold(result.title))
          for (const item of result.items.slice(0, 25)) {
            this.log(`  ${JSON.stringify(item)}`)
          }
          if (result.items.length > 25) {
            this.log(chalk.dim(`  … ${result.items.length - 25} more`))
          }
        }
      }
    } else {
      await this.outputResults(results, {})
    }

    if (flags.strict) {
      const mustHits = results.filter(
        (r) => r.severity === 'must' && r.count > 0,
      )
      if (mustHits.length > 0) {
        throw new CliError(
          `${mustHits.length} must-severity check${mustHits.length > 1 ? 's' : ''} ` +
            `found issues: ${mustHits.map((r) => r.name).join(', ')}`,
          { exitCode: 1 },
        )
      }
    }
  }
}
