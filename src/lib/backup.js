import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import createDebug from 'debug'

const debug = createDebug('pd:backup')

/**
 * Everything a full-account export covers. Sequential fetching keeps the
 * token budget predictable (each list page costs 20 tokens); the client's
 * 429 backoff handles bursts.
 * @type {{ name: string, path: string, pager: 'v1' | 'v2' | 'plain' }[]}
 */
export const BACKUP_RESOURCES = [
  { name: 'deals', path: '/api/v2/deals', pager: 'v2' },
  { name: 'persons', path: '/api/v2/persons', pager: 'v2' },
  { name: 'organizations', path: '/api/v2/organizations', pager: 'v2' },
  { name: 'activities', path: '/api/v2/activities', pager: 'v2' },
  { name: 'products', path: '/api/v2/products', pager: 'v2' },
  { name: 'pipelines', path: '/api/v2/pipelines', pager: 'v2' },
  { name: 'stages', path: '/api/v2/stages', pager: 'v2' },
  { name: 'dealFields', path: '/api/v2/dealFields', pager: 'v2' },
  { name: 'personFields', path: '/api/v2/personFields', pager: 'v2' },
  {
    name: 'organizationFields',
    path: '/api/v2/organizationFields',
    pager: 'v2',
  },
  { name: 'productFields', path: '/api/v2/productFields', pager: 'v2' },
  { name: 'activityFields', path: '/api/v2/activityFields', pager: 'v2' },
  { name: 'leads', path: '/api/v1/leads', pager: 'v1' },
  { name: 'notes', path: '/api/v1/notes', pager: 'v1' },
  { name: 'users', path: '/api/v1/users', pager: 'plain' },
  { name: 'filters', path: '/api/v1/filters', pager: 'plain' },
  { name: 'webhooks', path: '/api/v1/webhooks', pager: 'plain' },
  { name: 'currencies', path: '/api/v1/currencies', pager: 'plain' },
]

const MANIFEST = 'manifest.json'

function readManifest(dir) {
  const file = join(dir, MANIFEST)
  if (!existsSync(file)) return { completed: [], counts: {} }
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { completed: [], counts: {} }
  }
}

function writeManifest(dir, manifest) {
  writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest, null, 2))
}

async function fetchResource(client, resource) {
  if (resource.pager === 'v2') {
    const items = []
    for await (const item of client.pageV2(resource.path, { limit: 500 })) {
      items.push(item)
    }
    return items
  }
  if (resource.pager === 'v1') {
    const items = []
    for await (const item of client.pageV1(resource.path, { limit: 500 })) {
      items.push(item)
    }
    return items
  }
  const body = await client.get(resource.path)
  return body?.data ?? []
}

/**
 * Export the whole account to a JSON tree, one file per resource, with a
 * manifest checkpoint after each resource so interrupted runs can --resume.
 * @param {ReturnType<import('./client.js').createClient>} client
 * @param {string} dir target directory (created if missing)
 * @param {object} [options]
 * @param {boolean} [options.resume] skip resources already in the manifest
 * @param {(resource: string, count: number) => void} [options.onProgress]
 * @returns {Promise<{ total: number, exported: number, skipped: number, counts: Record<string, number> }>}
 */
export async function runBackup(client, dir, { resume, onProgress } = {}) {
  mkdirSync(dir, { recursive: true })

  const manifest = resume
    ? readManifest(dir)
    : { started_at: new Date().toISOString(), completed: [], counts: {} }

  let exported = 0
  let skipped = 0

  for (const resource of BACKUP_RESOURCES) {
    if (resume && manifest.completed.includes(resource.name)) {
      debug('skip %s (already in manifest)', resource.name)
      skipped++
      continue
    }

    debug('exporting %s', resource.name)
    const items = await fetchResource(client, resource)
    writeFileSync(
      join(dir, `${resource.name}.json`),
      JSON.stringify(items, null, 2),
    )

    if (!manifest.completed.includes(resource.name)) {
      manifest.completed.push(resource.name)
    }
    manifest.counts[resource.name] = items.length
    manifest.updated_at = new Date().toISOString()
    writeManifest(dir, manifest)

    exported++
    onProgress?.(resource.name, items.length)
  }

  return {
    total: BACKUP_RESOURCES.length,
    exported,
    skipped,
    counts: manifest.counts,
  }
}
