import { makeResolver } from './fields.js'

/** Resource → the captured *Fields.json that names its custom fields. */
const FIELDS_FOR = {
  deals: 'dealFields',
  persons: 'personFields',
  organizations: 'organizationFields',
  products: 'productFields',
  activities: 'activityFields',
}

/**
 * The *Fields.json files are resolution metadata, not diffable data — their
 * records are keyed by `field_code`, not `id`, so they must NOT go through the
 * id-based record diff (they'd all collapse to a single "undefined" bucket).
 */
const SCHEMA_RESOURCES = new Set(Object.values(FIELDS_FOR))

/** Recursively sort object keys so equality is key-order insensitive. */
export function canon(value) {
  if (Array.isArray(value)) return value.map(canon)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canon(value[k])]),
    )
  }
  return value
}

/** Stable equality for scalar/array/object field values (key-order safe). */
export function eq(a, b) {
  return JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null))
}

/**
 * Flatten a record into a field map. The nested v2 `custom_fields` object is
 * expanded to `custom_fields.<name>` entries; every other key stays top-level.
 * @param {object} record
 * @returns {Map<string, *>}
 */
function flatten(record) {
  const out = new Map()
  for (const [key, value] of Object.entries(record)) {
    if (key === 'custom_fields' && value && typeof value === 'object') {
      for (const [ck, cv] of Object.entries(value)) {
        out.set(`custom_fields.${ck}`, cv)
      }
    } else {
      out.set(key, value)
    }
  }
  return out
}

/** Index a resource's records by string id. */
function indexById(records) {
  const map = new Map()
  for (const record of records ?? []) map.set(String(record.id), record)
  return map
}

/**
 * Field-level diff of two backup snapshots, computed entirely from the loaded
 * JSON — no API calls. Each resource present in BOTH snapshots is compared by
 * record id; resources present in only one are reported under `skipped`.
 *
 * Custom-field hash keys and option ids are resolved to human names/labels
 * using each resource's captured *Fields.json (newer snapshot wins, older as
 * fallback), unless `resolveNames` is false. v1 resources (leads, notes) carry
 * no captured field schema, so their custom keys stay raw.
 *
 * @param {{ resources: Record<string, object[]> }} a older snapshot (loadBackup)
 * @param {{ resources: Record<string, object[]> }} b newer snapshot (loadBackup)
 * @param {{ resolveNames?: boolean }} [options]
 * @returns {{
 *   summary: { added: number, removed: number, modified: number, fieldsChanged: number },
 *   skipped: { resource: string, presentIn: 'A' | 'B' }[],
 *   changes: { resource: string, id: string, change: 'added'|'removed'|'modified',
 *     field: (string|null), oldValue: *, newValue: * }[],
 * }}
 */
export function diffBackups(a, b, { resolveNames = true } = {}) {
  const aResources = a.resources ?? {}
  const bResources = b.resources ?? {}
  const allNames = new Set([
    ...Object.keys(aResources),
    ...Object.keys(bResources),
  ])

  const changes = []
  const skipped = []
  const modifiedRecords = new Set()

  for (const resource of [...allNames].sort()) {
    // Schema files are metadata for resolution, not id-keyed data — never diff.
    if (SCHEMA_RESOURCES.has(resource)) continue

    const inA = resource in aResources
    const inB = resource in bResources
    if (!inA || !inB) {
      skipped.push({ resource, presentIn: inA ? 'A' : 'B' })
      continue
    }

    // Each side is resolved with ITS OWN snapshot's schema (falling back to the
    // other only when absent), so a field renamed/relabelled between A and B
    // shows the right name on each side rather than the newer one for both.
    const fieldsName = FIELDS_FOR[resource]
    const resolverFor = (own, other) =>
      resolveNames && fieldsName
        ? makeResolver(own[fieldsName] ?? other[fieldsName] ?? [])
        : null
    const resolverA = resolverFor(aResources, bResources)
    const resolverB = resolverFor(bResources, aResources)
    const prep = (record, resolver) =>
      flatten(resolver ? resolver.resolveCustomFields(record) : record)

    const aById = indexById(aResources[resource])
    const bById = indexById(bResources[resource])
    const ids = new Set([...aById.keys(), ...bById.keys()])

    for (const id of ids) {
      const aRec = aById.get(id)
      const bRec = bById.get(id)
      if (!bRec) {
        changes.push(row(resource, id, 'removed'))
        continue
      }
      if (!aRec) {
        changes.push(row(resource, id, 'added'))
        continue
      }
      const fa = prep(aRec, resolverA)
      const fb = prep(bRec, resolverB)
      const fields = new Set([...fa.keys(), ...fb.keys()])
      for (const field of fields) {
        const oldValue = fa.get(field)
        const newValue = fb.get(field)
        if (!eq(oldValue, newValue)) {
          modifiedRecords.add(`${resource}:${id}`)
          changes.push({
            resource,
            id,
            change: 'modified',
            field,
            oldValue: oldValue ?? null,
            newValue: newValue ?? null,
          })
        }
      }
    }
  }

  const summary = {
    added: changes.filter((c) => c.change === 'added').length,
    removed: changes.filter((c) => c.change === 'removed').length,
    modified: modifiedRecords.size,
    fieldsChanged: changes.filter((c) => c.change === 'modified').length,
  }
  return { summary, skipped, changes }
}

function row(resource, id, change) {
  return { resource, id, change, field: null, oldValue: null, newValue: null }
}
