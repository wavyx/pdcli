import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { confirmAction } from '../../lib/confirm.js'
import { CliError } from '../../lib/errors.js'

const POLL_INTERVAL_MS = 2000

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default class DealConvertCommand extends BaseCommand {
  static description =
    'Convert a deal to a lead. The conversion runs as an async job; ' +
    'use --wait to poll until it finishes. WARNING: on success the source ' +
    'deal is deleted.'

  static examples = [
    '<%= config.bin %> deal convert 42',
    '<%= config.bin %> deal convert 42 --yes',
    '<%= config.bin %> deal convert 42 --wait',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    wait: Flags.boolean({
      description: 'Poll the conversion status until it finishes',
      default: false,
    }),
    'timeout-secs': Flags.integer({
      description: 'Max seconds to poll when --wait is set',
      default: 30,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false,
    }),
  }

  /** Overridable in tests so polling never waits in real time. */
  static sleepFn = defaultSleep

  async run() {
    const { args, flags } = await this.parse(DealConvertCommand)

    const ok = await confirmAction(
      `Convert deal ${args.id} to a lead? Deal ${args.id} will be DELETED on success.`,
      flags.yes,
      { default: false },
    )
    if (!ok) {
      throw new CliError('Aborted', { exitCode: 1 })
    }

    const res = await this.apiClient.post(
      `/api/v2/deals/${args.id}/convert/lead`,
      // The endpoint takes no parameters, but the client sets a JSON
      // content-type — the API 400s on an empty body, so send {}.
      { body: {} },
    )
    const conversionId = res.data?.conversion_id

    if (!flags.wait) {
      await this.outputAction(
        { conversion_id: conversionId, status: 'started', deal_id: args.id },
        chalk.green(`Conversion started: ${conversionId}`) +
          `\nCheck status: ${this.config.bin} api GET ` +
          `/api/v2/deals/${args.id}/convert/status/${conversionId}`,
      )
      return
    }

    const timeoutMs = flags['timeout-secs'] * 1000
    const sleep = DealConvertCommand.sleepFn
    let elapsed = 0
    while (true) {
      const status = await this.apiClient.get(
        `/api/v2/deals/${args.id}/convert/status/${conversionId}`,
      )
      const state = status.data?.status
      if (state === 'completed') {
        await this.outputAction(
          {
            conversion_id: conversionId,
            status: 'completed',
            deal_id: args.id,
            lead_id: status.data?.lead_id,
          },
          chalk.green(
            `Conversion completed: deal ${args.id} → lead ${status.data?.lead_id}`,
          ),
        )
        return
      }
      if (state === 'failed' || state === 'rejected') {
        // A server-side conversion rejection is a bad-data outcome (65), not an
        // internal pdcli bug — exit 70 is reserved for genuine CLI defects.
        throw new CliError(`Conversion ${state} for deal ${args.id}`, {
          exitCode: 65,
        })
      }
      if (elapsed + POLL_INTERVAL_MS > timeoutMs) {
        throw new CliError(
          `Timed out after ${flags['timeout-secs']}s waiting for conversion ` +
            `${conversionId} (last status: ${state}). ` +
            `Check status: ${this.config.bin} api GET ` +
            `/api/v2/deals/${args.id}/convert/status/${conversionId}`,
          { exitCode: 1 },
        )
      }
      await sleep(POLL_INTERVAL_MS)
      elapsed += POLL_INTERVAL_MS
    }
  }
}
