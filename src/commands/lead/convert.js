import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'

const POLL_INTERVAL_MS = 2000

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default class LeadConvertCommand extends BaseCommand {
  static description =
    'Convert a lead to a deal. The conversion runs as an async job; ' +
    'use --wait to poll until it finishes. On success the lead is deleted.'

  static examples = [
    '<%= config.bin %> lead convert adf21080-0e10-11eb-879b-05d71fb426ec',
    '<%= config.bin %> lead convert adf21080-0e10-11eb-879b-05d71fb426ec --stage 7',
    '<%= config.bin %> lead convert adf21080-0e10-11eb-879b-05d71fb426ec --wait',
  ]

  static args = {
    id: Args.string({ required: true, description: 'Lead ID (UUID)' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    stage: Flags.integer({
      description: 'Stage ID for the new deal (a pipeline is inferred from it)',
    }),
    pipeline: Flags.integer({
      description: 'Pipeline ID for the new deal (ignored when --stage is set)',
    }),
    wait: Flags.boolean({
      description: 'Poll the conversion status until it finishes',
      default: false,
    }),
    'timeout-secs': Flags.integer({
      description: 'Max seconds to poll when --wait is set',
      default: 30,
    }),
  }

  /** Overridable in tests so polling never waits in real time. */
  static sleepFn = defaultSleep

  async run() {
    const { args, flags } = await this.parse(LeadConvertCommand)

    const body = {}
    if (flags.stage !== undefined) body.stage_id = flags.stage
    if (flags.pipeline !== undefined) body.pipeline_id = flags.pipeline

    const res = await this.apiClient.post(
      `/api/v2/leads/${args.id}/convert/deal`,
      { body },
    )
    const conversionId = res.data?.conversion_id

    if (!flags.wait) {
      this.log(chalk.green(`Conversion started: ${conversionId}`))
      this.log(
        `Check status: ${this.config.bin} api GET ` +
          `/api/v2/leads/${args.id}/convert/status/${conversionId}`,
      )
      return
    }

    const timeoutMs = flags['timeout-secs'] * 1000
    const sleep = LeadConvertCommand.sleepFn
    let elapsed = 0
    while (true) {
      const status = await this.apiClient.get(
        `/api/v2/leads/${args.id}/convert/status/${conversionId}`,
      )
      const state = status.data?.status
      if (state === 'completed') {
        this.log(
          chalk.green(
            `Conversion completed: lead ${args.id} → deal ${status.data?.deal_id}`,
          ),
        )
        return
      }
      if (state === 'failed' || state === 'rejected') {
        // A server-side conversion rejection is a bad-data outcome (65), not an
        // internal pdcli bug — exit 70 is reserved for genuine CLI defects.
        throw new CliError(`Conversion ${state} for lead ${args.id}`, {
          exitCode: 65,
        })
      }
      if (elapsed + POLL_INTERVAL_MS > timeoutMs) {
        throw new CliError(
          `Timed out after ${flags['timeout-secs']}s waiting for conversion ` +
            `${conversionId} (last status: ${state}). ` +
            `Check status: ${this.config.bin} api GET /api/v2/leads/${args.id}/convert/status/${conversionId}`,
          { exitCode: 1 },
        )
      }
      await sleep(POLL_INTERVAL_MS)
      elapsed += POLL_INTERVAL_MS
    }
  }
}
