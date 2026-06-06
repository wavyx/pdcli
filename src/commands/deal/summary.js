import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'

const columns = {
  currency: { header: 'Currency' },
  total: { header: 'Total' },
  weighted: { header: 'Weighted' },
  count: { header: 'Count' },
}

export default class DealSummaryCommand extends BaseCommand {
  static description = 'Summary of open/won/lost deals, totalled per currency'

  static examples = [
    '<%= config.bin %> deal summary',
    '<%= config.bin %> deal summary --status open --pipeline 1',
    '<%= config.bin %> deal summary --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    status: Flags.string({
      description: 'Filter by status',
      options: ['open', 'won', 'lost'],
    }),
    pipeline: Flags.integer({ description: 'Filter by pipeline ID' }),
    stage: Flags.integer({ description: 'Filter by stage ID' }),
    filter: Flags.integer({ description: 'Filter by saved filter ID' }),
  }

  async run() {
    const { flags } = await this.parse(DealSummaryCommand)

    // Summary lives on v1; the v2 wrapper does not exist. Cost: 40 tokens.
    const body = await this.apiClient.get('/api/v1/deals/summary', {
      query: {
        status: flags.status,
        pipeline_id: flags.pipeline,
        stage_id: flags.stage,
        filter_id: flags.filter,
      },
    })

    const data = body.data ?? {}

    // Non-table formats stay raw for scriptability: emit the data object as-is
    // (per-currency totals, grand totals, counts).
    if (this.resolveFormat() !== 'table') {
      await this.outputResults(data, columns)
      return
    }

    // Table view: one row per deal currency. Totals come pre-formatted from the
    // API (`value_formatted`, e.g. "€10") — render those rather than re-deriving
    // currency symbols. Weighted totals are keyed by the same currency code.
    const values = data.values_total ?? {}
    const weighted = data.weighted_values_total ?? {}
    // `get` returning undefined renders as an empty cell, so no `?? ''` tail.
    const rows = Object.entries(values).map(([currency, totals]) => ({
      currency,
      total: totals.value_formatted ?? totals.value,
      weighted:
        weighted[currency]?.value_formatted ?? weighted[currency]?.value,
      count: totals.count,
    }))

    await this.outputResults(rows, columns)
  }
}
