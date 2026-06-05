import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { collectPages } from '../lib/pagination.js'
import { parsePeriod, formatApiDatetime } from '../lib/period.js'
import { computeFunnel, computeExactFunnel } from '../lib/analytics.js'
import { CliError, ApiError } from '../lib/errors.js'

/** Token cost of one GET /deals/{id}/changelog request (rate-limit budget). */
const CHANGELOG_COST = 20
/** Above this deal count, mining gets expensive — warn before proceeding. */
const MINE_WARN_THRESHOLD = 100

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
   * Mine real stage transitions from each deal's v1 changelog. The changelog
   * uses a flat v2-style cursor (additional_data.next_cursor on a v1 path), so
   * the v2 pager works directly. Warns on stderr before mining a large set —
   * each request costs 20 tokens — then lets the client's rate limiter pace it.
   * @param {object[]} deals deals to mine (current stage_id needed per deal)
   * @param {object[]} stages
   * @param {number} pipelineId
   */
  async mineExactFunnel(deals, stages, pipelineId) {
    if (deals.length > MINE_WARN_THRESHOLD) {
      process.stderr.write(
        `Mining stage history for ${deals.length} deals ` +
          `(~${deals.length} requests, ${CHANGELOG_COST} tokens each); ` +
          `rate limiting may slow this down.\n`,
      )
    }

    const transitionsByDeal = []
    let skipped = 0
    for (const deal of deals) {
      try {
        const rows = await collectPages(
          this.apiClient.pageV2(`/api/v1/deals/${deal.id}/changelog`, {
            limit: 500,
          }),
        )
        transitionsByDeal.push({
          dealId: deal.id,
          stageId: deal.stage_id,
          rows,
        })
      } catch (err) {
        // One bad changelog request must not abort the whole mine: skip the
        // deal, count it, and warn once after mining completes.
        if (err instanceof ApiError) {
          skipped++
          continue
        }
        throw err
      }
    }

    if (skipped > 0) {
      process.stderr.write(
        `skipped ${skipped} deal(s) whose changelog could not be fetched\n`,
      )
    }

    return computeExactFunnel(transitionsByDeal, stages, { pipelineId })
  }
}
