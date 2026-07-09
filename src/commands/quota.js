import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { CliError } from '../lib/errors.js'

const columns = {
  remaining: {
    header: 'Remaining',
    get: (r) => (r.daily.remaining == null ? 'n/a' : r.daily.remaining),
  },
  limit: {
    header: 'Limit',
    get: (r) => (r.daily.limit == null ? 'n/a' : r.daily.limit),
  },
  pct: {
    header: '% Left',
    get: (r) => (r.daily.pct == null ? 'n/a' : `${r.daily.pct}%`),
  },
  reset: {
    header: 'Burst reset (s)',
    get: (r) => (r.reset == null ? 'n/a' : r.reset),
  },
}

export default class QuotaCommand extends BaseCommand {
  static aliases = ['ratelimit']

  static description =
    'Show the remaining Pipedrive daily API token budget. Makes one cheap ' +
    'probe request purely to read the rate-limit headers. The budget is ' +
    'COMPANY-WIDE — shared across every integration and user on the account — ' +
    'so treat the reading as a hint, not a guarantee. --min / --threshold gate ' +
    'CI: they exit 75 (rate-limited) when the budget is too low.'

  static examples = [
    '<%= config.bin %> quota',
    '<%= config.bin %> quota --output json',
    '<%= config.bin %> quota --min 5000',
    '<%= config.bin %> quota --threshold 10',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    min: Flags.integer({
      description:
        'Exit 75 if the remaining daily token budget is below this many tokens',
      min: 0,
    }),
    threshold: Flags.integer({
      description:
        'Exit 75 if the remaining daily token budget is below this percentage',
      min: 0,
      max: 100,
    }),
  }

  async run() {
    const { flags } = await this.parse(QuotaCommand)

    // A GET-single-entity probe (~2 tokens) purely to populate the rate-limit
    // headers. Users is v1-only (no v2 equivalent) and always exists.
    await this.apiClient.get('/api/v1/users/me')

    // transport() populates lastRateLimit off every response, so a resolved
    // probe GET above guarantees it is set (headers may still be absent).
    const rl = this.apiClient.lastRateLimit
    const remaining = rl.dailyRemaining
    const limit = rl.dailyLimit
    const hasData = remaining != null
    const pct =
      hasData && limit ? Math.round((remaining / limit) * 100) : undefined

    const data = {
      daily: {
        remaining: hasData ? remaining : null,
        limit: limit ?? null,
        pct: pct ?? null,
      },
      reset: rl.reset ?? null,
    }

    await this.outputResults(data, columns)

    // No headers → nothing to gate on. Never fabricate a pass/fail.
    if (!hasData) return

    if (flags.min != null && remaining < flags.min) {
      throw new CliError(
        `Daily token budget ${remaining} is below --min ${flags.min}`,
        { exitCode: 75 },
      )
    }
    if (flags.threshold != null && pct != null && pct < flags.threshold) {
      throw new CliError(
        `Daily token budget ${pct}% remaining is below --threshold ` +
          `${flags.threshold}%`,
        { exitCode: 75 },
      )
    }
  }
}
