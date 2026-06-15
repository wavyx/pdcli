import createDebug from 'debug'
import { CliError } from './errors.js'

const debug = createDebug('pd:bulk')

/**
 * Resolve the target ids for a bulk operation from exactly one selector:
 * --ids "1,2,3", a Pipedrive saved filter (--filter <id>), or piped stdin
 * (newline-separated ids, a JSON array of ids, or JSON objects with an id).
 * @param {object} selectors
 * @param {string} [selectors.ids]
 * @param {number} [selectors.filter]
 * @param {NodeJS.ReadStream} [selectors.stdin] defaults to process.stdin
 * @param {ReturnType<import('./client.js').createClient>} client
 * @param {string} listPath v2 list endpoint supporting filter_id (e.g. /api/v2/deals)
 * @returns {Promise<number[]>}
 */
export async function resolveTargets(
  { ids, filter, stdin = process.stdin },
  client,
  listPath,
) {
  if (ids) {
    return requireTargets(splitNonEmpty(ids, ',').map(parseId))
  }

  if (filter != null) {
    debug('resolving targets from filter %d', filter)
    const targets = []
    for await (const item of client.pageV2(listPath, {
      filter_id: filter,
      limit: 500,
    })) {
      targets.push(item.id)
    }
    return requireTargets(targets)
  }

  if (!stdin.isTTY) {
    const chunks = []
    for await (const chunk of stdin) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf8').trim()
    if (text.startsWith('[')) {
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch (cause) {
        throw new CliError('Piped stdin is not valid JSON', {
          exitCode: 65,
          cause,
        })
      }
      return requireTargets(parsed.map(parseEntry))
    }
    return requireTargets(splitNonEmpty(text, '\n').map(parseId))
  }

  throw new CliError(
    'No targets — pass --ids, --filter, or pipe ids on stdin',
    { exitCode: 64 },
  )
}

/** Split on a separator, dropping empty / whitespace-only segments. */
function splitNonEmpty(text, separator) {
  return text
    .split(separator)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '')
}

/** Fail with a no-targets usage error when nothing resolved. */
function requireTargets(targets) {
  if (targets.length === 0) {
    throw new CliError(
      'No targets — pass --ids, --filter, or pipe ids on stdin',
      { exitCode: 64 },
    )
  }
  return targets
}

/** Resolve one JSON-array entry (a bare id, or an object with an id). */
function parseEntry(entry) {
  const raw = typeof entry === 'object' && entry !== null ? entry.id : entry
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw new CliError(
      `Invalid id ${JSON.stringify(raw)} — expected a positive integer`,
      { exitCode: 65 },
    )
  }
  return id
}

function parseId(raw) {
  const trimmed = raw.trim()
  const id = Number(trimmed)
  if (!Number.isInteger(id) || id <= 0) {
    throw new CliError(
      `Invalid id "${trimmed}" — expected a positive integer`,
      { exitCode: 64 },
    )
  }
  return id
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run an async operation per item, sequentially with a pacing gap so bulk
 * writes stay inside Pipedrive's 2-second burst window (writes cost 10
 * tokens each; the client's 429 backoff covers anything that slips through).
 * Per-item failures are collected, never thrown.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => Promise<unknown>} operation
 * @param {object} [options]
 * @param {number} [options.gapMs] delay between requests (default 200)
 * @param {(done: number, total: number) => void} [options.onProgress]
 * @returns {Promise<{ succeeded: { item: T, result: unknown }[], failed: { item: T, error: string }[] }>}
 */
export async function bulkRun(
  items,
  operation,
  { gapMs = 200, onProgress } = {},
) {
  const succeeded = []
  const failed = []

  for (const [index, item] of items.entries()) {
    if (index > 0 && gapMs > 0) await sleep(gapMs)
    try {
      const result = await operation(item)
      succeeded.push({ item, result })
    } catch (err) {
      debug('bulk item %o failed: %s', item, err.message)
      // Keep the exit code so the caller can map a batch of data-validation
      // failures (e.g. ambiguous upsert matches → 65) to the right exit code.
      failed.push({ item, error: err.message, exitCode: err.exitCode })
    }
    onProgress?.(index + 1, items.length)
  }

  return { succeeded, failed }
}
