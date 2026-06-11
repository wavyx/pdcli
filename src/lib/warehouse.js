import {
  writeFileSync,
  appendFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { formatApiDatetime } from './period.js'

/**
 * The v2 entities that support `updated_since` incremental pulls — a strict
 * subset of BACKUP_RESOURCES (the others have no updated_since and can't be
 * synced incrementally).
 */
export const INCREMENTAL_ENTITIES = [
  { name: 'deals', path: '/api/v2/deals' },
  { name: 'persons', path: '/api/v2/persons' },
  { name: 'organizations', path: '/api/v2/organizations' },
  { name: 'activities', path: '/api/v2/activities' },
  { name: 'products', path: '/api/v2/products' },
]

// Distinct from backup's manifest.json so a warehouse and a backup can share
// a directory without one resetting the other's state.
const MANIFEST = 'warehouse-manifest.json'

function readManifest(dir) {
  const file = join(dir, MANIFEST)
  if (!existsSync(file)) return { watermarks: {}, counts: {} }
  try {
    const m = JSON.parse(readFileSync(file, 'utf8'))
    return { watermarks: m.watermarks ?? {}, counts: m.counts ?? {} }
  } catch {
    return { watermarks: {}, counts: {} }
  }
}

function writeManifest(dir, manifest) {
  writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest, null, 2))
}

/**
 * Incremental NDJSON export to `dir`. Each entity is appended (one JSON object
 * per line) to `<entity>.ndjson` and advances its OWN high-water mark in
 * warehouse-manifest.json. Per entity the start is: `since` override → stored
 * watermark → none (first run = full pull).
 *
 * The watermark advances to the newest `update_time` seen — NOT +1s. The log
 * is at-least-once (consumers dedupe by `(entity, id)`), so re-emitting the
 * inclusive boundary record is harmless, whereas +1s could skip a record saved
 * later in the boundary second. The advance never moves BACKWARD, so a one-off
 * `--since` backfill can't rewind the maintained cursor. It happens only after
 * the append succeeds, so an interrupted entity replays rather than skips.
 * `full` clears the watermarks (persisted up-front, before any truncation) and
 * truncates each file for a clean rebuild.
 *
 * NOTE: pull-based CDC sees creates and updates only — a hard delete in
 * Pipedrive simply stops appearing and leaves a stale row in the log. Reconcile
 * deletions periodically against a full `backup` key-set.
 *
 * @param {{ pageV2: (path: string, query?: object) => AsyncGenerator<object> }} client
 * @param {string} dir
 * @param {{ since?: string, full?: boolean, onProgress?: (entity: string, count: number) => void }} [options]
 * @returns {Promise<{ entities: string[], counts: Record<string, number> }>}
 */
export async function runWarehouseSync(
  client,
  dir,
  { since, full = false, onProgress } = {},
) {
  mkdirSync(dir, { recursive: true })
  const manifest = readManifest(dir)
  if (full) {
    // Persist the cleared state BEFORE truncating any file. If a --full run is
    // interrupted, the on-disk watermarks are already cleared, so a later run
    // full-re-pulls a truncated entity instead of resuming incrementally
    // against an emptied file (which would silently lose history).
    manifest.watermarks = {}
    manifest.counts = {}
    writeManifest(dir, manifest)
  }

  for (const { name, path } of INCREMENTAL_ENTITIES) {
    const file = join(dir, `${name}.ndjson`)
    if (full) writeFileSync(file, '') // truncate for a rebuild

    const entitySince = since ?? manifest.watermarks[name]
    const query = { limit: 500, sort_by: 'update_time', sort_direction: 'asc' }
    if (entitySince != null) query.updated_since = entitySince

    let count = 0
    let maxMs = null
    // Stream straight to the appender — never buffer the whole delta.
    for await (const item of client.pageV2(path, query)) {
      appendFileSync(file, `${JSON.stringify(item)}\n`)
      count++
      if (item.update_time != null) {
        const t = Date.parse(item.update_time)
        // A malformed timestamp is treated like a missing one: exported, but
        // it never becomes the watermark (so it can't crash formatApiDatetime).
        if (!Number.isNaN(t) && (maxMs == null || t > maxMs)) maxMs = t
      }
    }

    if (maxMs != null) {
      const advanced = formatApiDatetime(new Date(maxMs))
      const existing = manifest.watermarks[name]
      // Never regress: a one-off --since backfill must not rewind the cursor.
      manifest.watermarks[name] =
        existing != null && Date.parse(existing) >= maxMs ? existing : advanced
    }
    manifest.counts[name] = count
    manifest.updated_at = new Date().toISOString()
    writeManifest(dir, manifest)
    onProgress?.(name, count)
  }

  return {
    entities: INCREMENTAL_ENTITIES.map((e) => e.name),
    counts: manifest.counts,
  }
}
