import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { computeTransitionMatrix } from '../../lib/conversion-matrix.js'
import { mineMany } from '../../lib/changelog.js'
import { CliError } from '../../lib/errors.js'

export default class MetricsConversionMatrixCommand extends BaseCommand {
  static description =
    'Stage-transition matrix: every stage move (incl. backward & re-entry) ' +
    'mined from per-deal changelogs, with Won/Lost terminal columns'

  static examples = [
    '<%= config.bin %> metrics conversion-matrix',
    '<%= config.bin %> metrics conversion-matrix --pipeline 1 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
  }

  async run() {
    const { flags } = await this.parse(MetricsConversionMatrixCommand)

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
        this.apiClient.pageV2('/api/v2/deals', { ...base, status: 'won' }),
      ),
      collectPages(
        this.apiClient.pageV2('/api/v2/deals', { ...base, status: 'lost' }),
      ),
    ])

    const transitionsByDeal = await mineMany(this.apiClient, [
      ...open,
      ...won,
      ...lost,
    ])
    const matrix = computeTransitionMatrix(transitionsByDeal, stages, {
      pipelineId,
    })

    if (this.resolveFormat() !== 'table') {
      // JSON/YAML/CSV: emit the raw matrix object. The cell() helper is a
      // non-enumerable function on the result, so it never serializes here.
      await this.outputResults(matrix, {})
      return
    }

    // Table: the full source×dest grid is too wide to read, so render a
    // long-format edge list (one row per observed transition) plus a
    // per-source forward-rate summary underneath.
    await this.outputResults(matrix.edges, {
      fromStage: { header: 'From' },
      toStage: { header: 'To' },
      count: { header: 'Edges' },
      forward: {
        header: 'Direction',
        get: (row) => (row.forward ? 'forward' : 'backward'),
      },
    })

    await this.outputResults(matrix.sources, {
      stage: { header: 'Source stage' },
      totalOut: { header: 'Edges out' },
      forwardRate: {
        header: 'Forward %',
        get: (row) =>
          row.forwardRate == null
            ? ''
            : `${(row.forwardRate * 100).toFixed(0)}%`,
      },
    })
  }
}
