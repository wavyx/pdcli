import { Flags } from '@oclif/core'
import ora from 'ora'
import BaseCommand from '../base-command.js'
import { collectPages } from '../lib/pagination.js'
import { runChecks, AUDIT_CHECKS } from '../lib/audit.js'
import { computeNewFindings, summarize } from '../lib/watch.js'
import {
  loadConfig,
  getProfileConfig,
  setProfileConfig,
} from '../lib/config.js'
import { CliError } from '../lib/errors.js'

const WATCH_STATE_KEY = 'watch_state'

/** --severity → which severities arm the exit-8 gate. */
const ARMED = {
  must: ['must'],
  should: ['should'],
  all: ['must', 'should'],
}

export default class WatchCommand extends BaseCommand {
  static description =
    'Anomaly poller: run the hygiene checks and emit only findings that are ' +
    'NEW since the last run, advancing a per-profile state. Exits 8 when new ' +
    'findings arm the gate (default: must-severity) so cron can branch — ' +
    '`pdcli watch || notify`. --peek reads without advancing state.'

  static examples = [
    '<%= config.bin %> watch',
    '<%= config.bin %> watch --checks stale-deals,past-close-date',
    '<%= config.bin %> watch --severity all --output json',
    '<%= config.bin %> watch --peek',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    checks: Flags.string({
      description: `Comma-separated subset of checks (${AUDIT_CHECKS.map((c) => c.name).join(', ')})`,
    }),
    severity: Flags.string({
      description: 'Which severities arm the exit-8 gate',
      options: ['must', 'should', 'all'],
      default: 'must',
    }),
    peek: Flags.boolean({
      description: 'Emit and gate without advancing the stored state',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(WatchCommand)
    const now = new Date()
    const { activeProfile } = loadConfig(flags.profile)

    const only = flags.checks?.split(',').map((c) => c.trim())
    if (only) {
      const known = new Set(AUDIT_CHECKS.map((c) => c.name))
      const bad = only.filter((c) => !known.has(c))
      if (bad.length > 0) {
        throw new CliError(
          `Unknown check${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}. ` +
            `Valid: ${[...known].join(', ')}`,
          { exitCode: 64 },
        )
      }
    }

    const spinner = ora('Fetching account data...').start()
    let data
    try {
      const [open, won, lost, persons, organizations, activities] =
        await Promise.all([
          collectPages(
            this.apiClient.pageV2('/api/v2/deals', {
              status: 'open',
              limit: 500,
            }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/deals', {
              status: 'won',
              limit: 500,
            }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/deals', {
              status: 'lost',
              limit: 500,
            }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/persons', { limit: 500 }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/organizations', { limit: 500 }),
          ),
          collectPages(
            this.apiClient.pageV2('/api/v2/activities', { limit: 500 }),
          ),
        ])
      data = {
        deals: [...open, ...won, ...lost],
        persons,
        organizations,
        activities,
      }
    } finally {
      spinner.stop()
    }

    const results = runChecks(data, { now, only })
    const prior = getProfileConfig(activeProfile, WATCH_STATE_KEY) ?? {}
    const { newFindings, nextState } = computeNewFindings(results, prior)

    // Emit BEFORE advancing/gating: a render failure must replay, not skip.
    if (this.resolveFormat() === 'table') {
      await this.outputResults(newFindings, {
        severity: {
          header: 'Sev',
          get: (r) => (r.severity === 'must' ? '●' : '○'),
        },
        check: { header: 'Check' },
        key: { header: 'Key' },
        summary: { header: 'Summary', get: (r) => summarize(r.item) },
      })
    } else {
      await this.outputResults(newFindings, {})
    }

    if (!flags.peek) {
      setProfileConfig(activeProfile, WATCH_STATE_KEY, nextState)
    }

    const armed = ARMED[flags.severity]
    const armedNew = newFindings.filter((f) => armed.includes(f.severity))
    if (armedNew.length > 0) {
      const label = flags.severity === 'all' ? 'must/should' : flags.severity
      throw new CliError(
        `${armedNew.length} new ${label}-severity finding${armedNew.length > 1 ? 's' : ''}`,
        { exitCode: 8 },
      )
    }
  }
}
