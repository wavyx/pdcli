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

const MANIFEST = 'manifest.json'

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
 * manifest.json. Per entity the start is: `since` override → stored watermark
 * → none (first run = full pull). The watermark advances to the newest
 * `update_time` seen + 1s (updated_since is inclusive) ONLY after the append
 * succeeds, so an interrupted entity replays rather than skips. `full` ignores
 * watermarks and truncates each file for a clean rebuild.
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
  if (full) manifest.watermarks = {}

  for (const { name, path } of INCREMENTAL_ENTITIES) {
    const file = join(dir, `${name}.ndjson`)
    if (full) writeFileSync(file, '') // truncate for a rebuild

    const entitySince = since ?? manifest.watermarks[name]
    const query = { limit: 500, sort_by: 'update_time', sort_direction: 'asc' }
    if (entitySince != null) query.updated_since = entitySince

    let count = 0
    let maxUpdate = null
    // Stream straight to the appender — never buffer the whole delta.
    for await (const item of client.pageV2(path, query)) {
      appendFileSync(file, `${JSON.stringify(item)}\n`)
      count++
      if (item.update_time != null) {
        const d = new Date(item.update_time)
        if (maxUpdate == null || d > maxUpdate) maxUpdate = d
      }
    }

    if (maxUpdate != null) {
      manifest.watermarks[name] = formatApiDatetime(
        new Date(maxUpdate.getTime() + 1000),
      )
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
