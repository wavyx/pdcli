import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { CliError, RateLimitError } from '../lib/errors.js'

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
    // headers. Users is v1-only (no v2 equivalent) and always exists. The
    // probe goes through the shared transport, which THROWS a RateLimitError
    // (exit 75) on a 429 or an exhausted daily budget — but that is precisely
    // the reading a user runs `quota` to see. transport snapshots lastRateLimit
    // off the 429 response BEFORE throwing, so swallow the rate-limit throw and
    // fall through to print the reading; re-throw anything else (auth, 5xx,
    // network) unchanged.
    try {
      await this.apiClient.get('/api/v1/users/me')
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err
    }

    // transport() populates lastRateLimit off every response (including the 429
    // above), so it is set whether the probe resolved or was rate-limited.
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

    // --min gates on the absolute remaining; skip silently when there is no
    // remaining reading to compare (nothing to gate on — never fabricate one).
    if (flags.min != null && hasData && remaining < flags.min) {
      throw new CliError(
        `Daily token budget ${remaining} is below --min ${flags.min}`,
        { exitCode: 75 },
      )
    }

    // --threshold gates on the percentage. If the caller asked for it but no
    // pct could be computed (the daily-limit header was absent, or there was no
    // reading at all), do NOT silently pass — a false green would let a CI job
    // gating on `pdcli quota --threshold N` proceed blind. Fail closed.
    if (flags.threshold != null) {
      if (pct == null) {
        throw new CliError(
          'cannot evaluate --threshold: no daily-limit header in the API ' +
            'response (x-daily-ratelimit-token-limit absent)',
          { exitCode: 69 },
        )
      }
      if (pct < flags.threshold) {
        throw new CliError(
          `Daily token budget ${pct}% remaining is below --threshold ` +
            `${flags.threshold}%`,
          { exitCode: 75 },
        )
      }
    }
  }
}
