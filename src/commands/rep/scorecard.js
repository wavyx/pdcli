import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { parsePeriod, formatApiDatetime } from '../../lib/period.js'
import { computeScorecard } from '../../lib/scorecard.js'

export default class RepScorecardCommand extends BaseCommand {
  static description =
    'Per-rep scorecard: win rate, cycle, velocity and deal hygiene by owner, ' +
    'across all pipelines (account-wide) unless narrowed'

  static examples = [
    '<%= config.bin %> rep scorecard',
    '<%= config.bin %> rep scorecard --period 30d --pipeline 1',
    '<%= config.bin %> rep scorecard --owner 42 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    period: Flags.string({
      description: 'Trailing window for closed deals (Nd or Nm)',
      default: '90d',
    }),
    pipeline: Flags.integer({ description: 'Restrict to a pipeline ID' }),
    owner: Flags.integer({
      description: 'Restrict to a single owner (user) ID',
    }),
  }

  async run() {
    const { flags } = await this.parse(RepScorecardCommand)
    const now = new Date()
    const since = parsePeriod(flags.period, now)

    const base = {
      pipeline_id: flags.pipeline,
      owner_id: flags.owner,
      limit: 500,
    }
    const [open, won, lost, usersBody] = await Promise.all([
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
      // Users are v1-only and UNPAGINATED — the whole roster in one response.
      this.apiClient.get('/api/v1/users'),
    ])

    const users = usersBody.data ?? []
    const rows = computeScorecard([...open, ...won, ...lost], users, {
      since,
      now,
    })

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(rows, {})
      return
    }

    const pct = (r) =>
      r.winRate == null
        ? 'n/a'
        : `${(r.winRate * 100).toFixed(0)}% (${r.wonCount}W/${r.lostCount}L)`
    // Number.isFinite also rejects NaN — a won deal with an unparseable
    // add_time yields a NaN cycle, which must render 'n/a', not 'NaN'.
    const num =
      (key, digits = 0) =>
      (r) =>
        Number.isFinite(r[key]) ? r[key].toFixed(digits) : 'n/a'

    await this.outputResults(rows, {
      ownerName: { header: 'Rep' },
      active: {
        header: 'Active',
        get: (r) =>
          r.active === false ? 'no' : r.active === true ? 'yes' : '—',
      },
      openCount: { header: 'Open' },
      winRate: { header: 'Win rate', get: pct },
      avgCycleDays: { header: 'Cycle (d)', get: num('avgCycleDays') },
      velocityPerDay: { header: 'Velocity/d', get: num('velocityPerDay') },
      staleOpen: { header: 'Stale' },
      pastClose: { header: 'Past close' },
      noCloseDate: { header: 'No date' },
      missingContact: { header: 'No contact' },
    })
  }
}
