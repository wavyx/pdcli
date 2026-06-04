import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { parsePeriod, formatApiDatetime } from '../../lib/period.js'
import { computeVelocity } from '../../lib/analytics.js'

export default class MetricsVelocityCommand extends BaseCommand {
  static description =
    'Sales Velocity Equation: (open × win rate × avg won value) / cycle days'

  static examples = [
    '<%= config.bin %> metrics velocity',
    '<%= config.bin %> metrics velocity --period 30d --pipeline 1',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    period: Flags.string({
      description: 'Trailing window for closed deals (Nd or Nm)',
      default: '90d',
    }),
    pipeline: Flags.integer({ description: 'Restrict to a pipeline ID' }),
    owner: Flags.integer({ description: 'Restrict to an owner (user) ID' }),
  }

  async run() {
    const { flags } = await this.parse(MetricsVelocityCommand)
    const now = new Date()
    const since = parsePeriod(flags.period, now)

    const base = {
      pipeline_id: flags.pipeline,
      owner_id: flags.owner,
      limit: 500,
    }
    const [open, won, lost] = await Promise.all([
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', { ...base, status: 'open' }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', {
          ...base,
          status: 'won',
          updated_since: formatApiDatetime(since),
        }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', {
          ...base,
          status: 'lost',
          updated_since: formatApiDatetime(since),
        }),
      ),
    ])

    const velocity = computeVelocity([...open, ...won, ...lost], { since, now })

    if (this.resolveFormat() === 'table') {
      const fmt = (v, digits = 1) => (v == null ? 'n/a' : v.toFixed(digits))
      await this.outputResults(
        [
          { metric: 'Open opportunities', value: String(velocity.openCount) },
          {
            metric: `Win rate (${flags.period})`,
            value:
              velocity.winRate == null
                ? 'n/a'
                : `${(velocity.winRate * 100).toFixed(1)}% (${velocity.wonCount}W/${velocity.lostCount}L)`,
          },
          { metric: 'Avg won value', value: fmt(velocity.avgWonValue, 0) },
          { metric: 'Avg cycle (days)', value: fmt(velocity.avgCycleDays) },
          { metric: 'Velocity / day', value: fmt(velocity.velocityPerDay, 0) },
        ],
        { metric: { header: 'Metric' }, value: { header: 'Value' } },
      )
      return
    }

    await this.outputResults(velocity, {})
  }
}
