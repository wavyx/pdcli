import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { computeAging } from '../../lib/aging.js'
import { mineMany } from '../../lib/changelog.js'
import { CliError } from '../../lib/errors.js'

export default class MetricsAgingCommand extends BaseCommand {
  static description =
    'Deal aging: days-in-current-stage per open deal, bucketed, with a ' +
    'p90-dwell flag (mines each open deal’s changelog, one request per deal)'

  static examples = [
    '<%= config.bin %> metrics aging',
    '<%= config.bin %> metrics aging --pipeline 1 --buckets 30,60,90',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
    buckets: Flags.string({
      description:
        'Comma-separated day thresholds; cohorts are 0-N1/N1-N2/.../last+ ' +
        '(lower bound inclusive, upper exclusive)',
      default: '30,60,90',
    }),
  }

  async run() {
    const { flags } = await this.parse(MetricsAgingCommand)
    const now = new Date()

    const buckets = flags.buckets.split(',').map((s) => s.trim())
    if (buckets.some((s) => !/^\d+$/.test(s))) {
      throw new CliError(
        `Invalid --buckets "${flags.buckets}" — use comma-separated day ` +
          `counts, e.g. 30,60,90`,
        { exitCode: 64 },
      )
    }
    const thresholds = buckets.map(Number)
    if (
      thresholds.some((n) => n <= 0) ||
      new Set(thresholds).size !== thresholds.length
    ) {
      throw new CliError(
        `Invalid --buckets "${flags.buckets}" — thresholds must be positive ` +
          `and distinct, e.g. 30,60,90`,
        { exitCode: 64 },
      )
    }

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

    // Open deals are not period-bound — aging asks "how long has this open
    // deal sat where it is now?", so there is no --period flag; all open deals
    // in the pipeline are mined.
    const [stages, open] = await Promise.all([
      collectPages(
        this.apiClient.pageV2('/api/v2/stages', {
          pipeline_id: pipelineId,
          limit: 500,
        }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', {
          pipeline_id: pipelineId,
          status: 'open',
          limit: 500,
        }),
      ),
    ])

    const transitionsByDeal = await mineMany(this.apiClient, open)
    const rows = computeAging(open, transitionsByDeal, stages, {
      now,
      buckets: thresholds,
    })

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(rows, {})
      return
    }

    // Table: one column per bucket label (count and value), then the p90 flag.
    // Bucket labels are derived from the first row so the table tracks
    // whatever --buckets produced.
    const labels = Object.keys(rows[0]?.buckets ?? {})
    const columns = { stage: { header: 'Stage' } }
    for (const label of labels) {
      columns[label] = {
        header: label,
        get: (row) => {
          const b = row.buckets[label]
          return b.count === 0 ? '0' : `${b.count} (${b.value})`
        },
      }
    }
    columns.p90ExceededCount = {
      header: '> p90 dwell',
      get: (row) =>
        row.p90Days == null
          ? '—'
          : `${row.p90ExceededCount} (p90 ${row.p90Days.toFixed(0)}d)`,
    }
    if (rows.some((r) => r.unknownCount > 0)) {
      columns.unknownCount = { header: 'Unknown' }
    }

    await this.outputResults(rows, columns)
  }
}
