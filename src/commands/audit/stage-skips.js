import { Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { mineMany } from '../../lib/changelog.js'
import { computeStageSkips } from '../../lib/stage-skips.js'
import { CliError } from '../../lib/errors.js'

export default class AuditStageSkipsCommand extends BaseCommand {
  static description =
    'Stage-skip & sandbagging audit: deals that jumped gates or were pulled ' +
    'backward, mined from each deal’s changelog (one request per deal)'

  static examples = [
    '<%= config.bin %> audit stage-skips',
    '<%= config.bin %> audit stage-skips --pipeline 1 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    pipeline: Flags.integer({
      description: 'Pipeline ID (required when the account has several)',
    }),
  }

  async run() {
    const { flags } = await this.parse(AuditStageSkipsCommand)

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

    // Stage skips are about history, so all deal states matter: a won or lost
    // deal can have jumped a gate just as an open one can. Fetch all three.
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
    const findings = computeStageSkips(transitionsByDeal, stages)

    if (this.resolveFormat() === 'table' && findings.length === 0) {
      this.log(chalk.dim('No stage skips or backward moves found.'))
      return
    }

    await this.outputResults(findings, {
      dealId: { header: 'Deal' },
      kind: { header: 'Kind' },
      from: {
        header: 'From',
        get: (row) => `${row.from.name} (${row.from.order})`,
      },
      to: { header: 'To', get: (row) => `${row.to.name} (${row.to.order})` },
      skipped: {
        header: 'Skipped gates',
        get: (row) => row.skipped.join(', '),
      },
      actor_user_id: {
        header: 'Actor',
        get: (row) =>
          row.actor_user_id == null ? '' : String(row.actor_user_id),
      },
    })
  }
}
