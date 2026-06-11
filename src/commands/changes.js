import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { collectPages } from '../lib/pagination.js'
import { parsePeriod, formatApiDatetime } from '../lib/period.js'
import { buildChangeFeed } from '../lib/changes.js'
import {
  loadConfig,
  getProfileConfig,
  setProfileConfig,
} from '../lib/config.js'
import { CliError } from '../lib/errors.js'

const WATERMARK_KEY = 'changes_watermark'

/** The five v2 entities that support `updated_since` + update_time ordering. */
const ENTITY_PATHS = {
  deals: '/api/v2/deals',
  persons: '/api/v2/persons',
  organizations: '/api/v2/organizations',
  activities: '/api/v2/activities',
  products: '/api/v2/products',
}

/**
 * Resolve a --since value to an RFC3339 `updated_since` string. Accepts a
 * trailing period (Nd/Nm) or an absolute timestamp; rejects garbage (exit 64).
 */
function resolveSince(value, now) {
  if (/^\d+[dm]$/.test(value)) return formatApiDatetime(parsePeriod(value, now))
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    throw new CliError(
      `Invalid --since "${value}" — use an RFC3339 timestamp or Nd/Nm`,
      { exitCode: 64 },
    )
  }
  return formatApiDatetime(new Date(ms))
}

export default class ChangesCommand extends BaseCommand {
  static description =
    'Incremental change feed across deals/persons/orgs/activities/products. ' +
    'Self-advancing watermark: each run resumes where the last left off and ' +
    'advances it to the newest change (use --peek to read without advancing).'

  static examples = [
    '<%= config.bin %> changes --since 7d',
    '<%= config.bin %> changes',
    '<%= config.bin %> changes --peek --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    since: Flags.string({
      description:
        'Start point: RFC3339 timestamp or Nd/Nm. Omit to resume from the ' +
        'stored watermark.',
    }),
    peek: Flags.boolean({
      description: 'Read without advancing the stored watermark',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(ChangesCommand)
    const now = new Date()
    const { activeProfile } = loadConfig(flags.profile)

    let since
    if (flags.since != null) {
      since = resolveSince(flags.since, now)
    } else {
      const stored = getProfileConfig(activeProfile, WATERMARK_KEY)
      if (stored == null) {
        throw new CliError(
          'No stored watermark yet — pass --since <timestamp|Nd> for the first run',
          { exitCode: 64 },
        )
      }
      since = formatApiDatetime(new Date(stored))
    }

    const query = {
      updated_since: since,
      sort_by: 'update_time',
      sort_direction: 'asc',
      limit: 500,
    }
    const byEntity = {}
    await Promise.all(
      Object.entries(ENTITY_PATHS).map(async ([name, path]) => {
        byEntity[name] = await collectPages(this.apiClient.pageV2(path, query))
      }),
    )

    const { rows, maxUpdate } = buildChangeFeed(byEntity, since)

    if (!flags.peek && maxUpdate != null) {
      const next = formatApiDatetime(maxUpdate)
      setProfileConfig(activeProfile, WATERMARK_KEY, next)
      process.stderr.write(`Advanced watermark → ${next}\n`)
    }

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(rows, {})
      return
    }

    await this.outputResults(rows, {
      entity: { header: 'Entity' },
      change: { header: 'Change' },
      id: { header: 'ID' },
      title: { header: 'Title', get: (r) => r.title ?? '' },
      updateTime: { header: 'Updated', get: (r) => r.updateTime ?? '' },
    })
  }
}
