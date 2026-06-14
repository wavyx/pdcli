import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { collectPages } from '../lib/pagination.js'
import { formatApiDatetime, resolveSince } from '../lib/period.js'
import { buildChangeFeed } from '../lib/changes.js'
import {
  loadConfig,
  getProfileConfig,
  setProfileConfig,
} from '../lib/config.js'
import { CliError } from '../lib/errors.js'

const WATERMARK_KEY = 'changes_watermark'

/** Whole-second bucket of an update_time (v2 timestamps are seconds-precision);
 *  null/missing sorts before everything so it's never treated as a boundary. */
function secondOf(updateTime) {
  if (updateTime == null) return -Infinity
  return Math.floor(new Date(updateTime).getTime() / 1000)
}

/** The five v2 entities that support `updated_since` + update_time ordering. */
const ENTITY_PATHS = {
  deals: '/api/v2/deals',
  persons: '/api/v2/persons',
  organizations: '/api/v2/organizations',
  activities: '/api/v2/activities',
  products: '/api/v2/products',
}

export default class ChangesCommand extends BaseCommand {
  static description =
    'Incremental change feed across deals/persons/orgs/activities/products. ' +
    'Self-advancing watermark: each run resumes where the last left off and ' +
    'advances it past the newest change only after a successful emit, so a ' +
    'failed run replays rather than skips (use --peek to read without advancing).'

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

    const { rows: allRows } = buildChangeFeed(byEntity, since)
    // --limit caps rows per run; the watermark resumes at the cut so the rest
    // arrive next run (no skip). Rows are sorted ascending by update_time.
    let rows = flags.limit != null ? allRows.slice(0, flags.limit) : allRows

    // update_time has SECONDS precision and the watermark advances to (max + 1s)
    // below. If --limit cuts mid-second, that +1s would jump past unemitted rows
    // sharing the cut second — silently lost. So on truncation, drop the trailing
    // rows that share the last emitted row's second; they replay next run and the
    // +1s advance (now landing on an earlier second) skips nothing.
    const truncated = flags.limit != null && allRows.length > rows.length
    const cutSecond = truncated
      ? secondOf(rows[rows.length - 1].updateTime)
      : null
    // Only a problem when a DROPPED row shares the cut row's second; if the next
    // dropped row is in a later second, the +1s advance is already skip-free.
    if (truncated && secondOf(allRows[rows.length].updateTime) === cutSecond) {
      const trimmed = rows.filter((r) => secondOf(r.updateTime) < cutSecond)
      if (trimmed.length > 0) {
        rows = trimmed
      } else {
        // A single second holds more rows than --limit; we cannot bound at the
        // limit without either looping forever or skipping. Emit this second and
        // advance past it, but say so — a loud warning beats silent feed loss.
        process.stderr.write(
          `Warning: --limit ${flags.limit} splits a single update-time second; ` +
            `rows in that second beyond the limit are skipped. Raise --limit to avoid this.\n`,
        )
      }
    }

    // Emit BEFORE advancing: if rendering throws, the window replays next run
    // rather than being silently skipped.
    const columns =
      this.resolveFormat() === 'table'
        ? {
            entity: { header: 'Entity' },
            change: { header: 'Change' },
            id: { header: 'ID' },
            title: { header: 'Title', get: (r) => r.title ?? '' },
            updateTime: { header: 'Updated', get: (r) => r.updateTime ?? '' },
          }
        : {}
    await this.outputResults(rows, columns)

    if (!flags.peek) {
      // Advance to ONE SECOND past the newest EMITTED change. updated_since is
      // inclusive (>=), so advancing to the exact max would re-emit the
      // boundary record every run; +1s (v2 update_time is seconds) excludes it.
      const emittedMax = rows.reduce((max, r) => {
        if (r.updateTime == null) return max
        const d = new Date(r.updateTime)
        return max == null || d > max ? d : max
      }, null)
      if (emittedMax != null) {
        const next = formatApiDatetime(new Date(emittedMax.getTime() + 1000))
        setProfileConfig(activeProfile, WATERMARK_KEY, next)
        process.stderr.write(`Advanced watermark → ${next}\n`)
      }
    }
  }
}
