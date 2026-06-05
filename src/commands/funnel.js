import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { collectPages } from '../lib/pagination.js'
import { parsePeriod, formatApiDatetime } from '../lib/period.js'
import { computeFunnel, computeExactFunnel } from '../lib/analytics.js'
import { mineMany } from '../lib/changelog.js'
import { CliError } from '../lib/errors.js'

export default class FunnelCommand extends BaseCommand {
  static description =
    'Stage-to-stage conversion approximated from closed deals (final stage reached)'

  static examples = [
    '<%= config.bin %> funnel',
    '<%= config.bin %> funnel --pipeline 1 --period 180d',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    period: Flags.string({
      description: 'Trailing window for closed deals (Nd or Nm)',
      default: '90d',
    }),
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
    exact: Flags.boolean({
      description:
        'Mine real stage transitions from each deal’s changelog instead ' +
        'of approximating from the final stage (one request per deal). ' +
        '--period scopes only closed (won/lost) deals; open deals are ' +
        'always included.',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(FunnelCommand)
    const now = new Date()
    const since = parsePeriod(flags.period, now)

    let pipelineId = flags.pipeline
    if (pipelineId == null) {
      const body = await this.apiClient.get('/api/v2/pipelines')
      const pipelines = body.data ?? []
      if (pipelines.length > 1) {
        throw new CliError(
          `Account has ${pipelines.length} pipelines — pass --pipeline <id> ` +
            `(${pipelines.map((p) => `${p.id}=${p.name}`).join(', ')})`,
          { exitCode: 64 },
        )
      }
      pipelineId = pipelines[0]?.id
    }

    const base = { pipeline_id: pipelineId, limit: 500 }
    const [stages, open, won, lost] = await Promise.all([
      collectPages(
        this.apiClient.pageV2('/api/v2/stages', {
          pipeline_id: pipelineId,
          limit: 500,
        }),
      ),
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

    if (flags.exact) {
      const exact = await this.mineExactFunnel(
        [...open, ...won, ...lost],
        stages,
        pipelineId,
      )
      const columns = {
        stage: { header: 'Stage' },
        entered: { header: 'Entered (observed)' },
        conversionFromPrev: {
          // Not funnel conversion — exact entries are non-monotonic so this
          // ratio can exceed 100%. Labelled to avoid that misreading.
          header: 'Entered vs prev',
          get: (row) =>
            row.conversionFromPrev == null
              ? ''
              : `${(row.conversionFromPrev * 100).toFixed(0)}%`,
        },
      }
      // `won` is a single total: tables report it once under the rows;
      // machine formats carry it as a top-level field next to the rows.
      if (this.resolveFormat() === 'table') {
        await this.outputResults(exact.rows, columns)
        this.log(`Won: ${exact.won}`)
      } else {
        await this.outputResults(exact, columns)
      }
      return
    }

    const funnel = computeFunnel([...won, ...lost], open, stages, {
      pipelineId,
    })

    await this.outputResults(funnel, {
      stage: { header: 'Stage' },
      reached: { header: `Reached (closed, ${flags.period})` },
      conversionFromPrev: {
        header: 'Conv. from prev',
        get: (row) =>
          row.conversionFromPrev == null
            ? ''
            : `${(row.conversionFromPrev * 100).toFixed(0)}%`,
      },
      openCount: { header: 'Open now' },
      openValue: { header: 'Open value' },
    })
  }

  /**
   * Mine real stage transitions from each deal's v1 changelog (one request per
   * deal, paced by the rate limiter), then compute the exact funnel. Mining,
   * the large-set warning, and the skip-on-ApiError behavior live in the
   * shared changelog lib so this command and `deal history` stay in step.
   * @param {object[]} deals deals to mine (current stage_id needed per deal)
   * @param {object[]} stages
   * @param {number} pipelineId
   */
  async mineExactFunnel(deals, stages, pipelineId) {
    const transitionsByDeal = await mineMany(this.apiClient, deals)
    return computeExactFunnel(transitionsByDeal, stages, { pipelineId })
  }
}
