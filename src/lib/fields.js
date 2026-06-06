import createDebug from 'debug'
import { CliError } from './errors.js'

const debug = createDebug('pd:fields')

/** Entity (and aliases) → v2 fields endpoint. */
const ENTITY_FIELDS = {
  deal: 'dealFields',
  person: 'personFields',
  org: 'organizationFields',
  organization: 'organizationFields',
  product: 'productFields',
  activity: 'activityFields',
}

/**
 * Entities whose fields live ONLY on v1 — offset-paginated and returning the
 * legacy key/name shape that getFields normalizes to field_code/field_name.
 */
const V1_ENTITY_FIELDS = {
  lead: 'leadFields',
  note: 'noteFields',
}

/**
 * @param {string} entity deal | person | org(anization) | product | activity
 *   | lead | note
 * @returns {string} fields endpoint path (v2 for core entities, v1 for
 *   lead/note)
 */
export function entityToFieldsPath(entity) {
  const v2 = ENTITY_FIELDS[entity]
  if (v2) return `/api/v2/${v2}`

  const v1 = V1_ENTITY_FIELDS[entity]
  if (v1) return `/api/v1/${v1}`

  throw new CliError(
    `Unknown entity "${entity}". Use one of: ${[
      ...Object.keys(ENTITY_FIELDS),
      ...Object.keys(V1_ENTITY_FIELDS),
    ].join(', ')}`,
    { exitCode: 64 },
  )
}

/** @type {Map<string, object[]>} per-run field-definition cache */
const cache = new Map()

export function clearFieldsCache() {
  cache.clear()
}

/**
 * Normalize a v1 field definition (key/name) to the v2 shape
 * (field_code/field_name) so callers can treat both alike.
 * @param {object} def
 */
function normalizeV1Field(def) {
  const { key, name, ...rest } = def
  return { ...rest, field_code: key, field_name: name }
}

/**
 * Fetch (and memoize for this run) all field definitions for an entity.
 * Core entities use the v2 cursor pager; lead/note use the v1 offset pager
 * and are normalized to the v2 field_code/field_name shape.
 * @param {{ pageV2: (path: string) => AsyncGenerator<object>,
 *   pageV1: (path: string) => AsyncGenerator<object> }} client
 * @param {string} entity
 * @returns {Promise<object[]>}
 */
export async function getFields(client, entity) {
  const path = entityToFieldsPath(entity)
  if (cache.has(path)) return cache.get(path)

  const isV1 = path.startsWith('/api/v1/')
  debug('fetching field definitions: %s', path)
  const defs = []
  const pager = isV1 ? client.pageV1(path) : client.pageV2(path)
  for await (const def of pager) {
    defs.push(isV1 ? normalizeV1Field(def) : def)
  }
  cache.set(path, defs)
  return defs
}

/**
 * Build a resolver for name⇄key and option label⇄ID lookups.
 * @param {object[]} defs v2 field definitions
 *   ({ field_code, field_name, field_type, options })
 */
export function makeResolver(defs) {
  const byName = new Map()
  const byKey = new Map()
  for (const def of defs) {
    byName.set(def.field_name.toLowerCase(), def)
    byKey.set(def.field_code, def)
  }

  function optionsOf(fieldKey) {
    return byKey.get(fieldKey)?.options
  }

  return {
    /** @param {string} name @returns {string | undefined} hashed key */
    nameToKey(name) {
      return byName.get(name.toLowerCase())?.field_code
    },

    /** @param {string} key @returns {string | undefined} human name */
    keyToName(key) {
      return byKey.get(key)?.field_name
    },

    /** @param {string} fieldKey @param {string} label @returns {number | undefined} */
    labelToOptionId(fieldKey, label) {
      return optionsOf(fieldKey)?.find(
        (o) => o.label.toLowerCase() === label.toLowerCase(),
      )?.id
    },

    /** @param {string} fieldKey @param {number} id @returns {string | undefined} */
    optionIdToLabel(fieldKey, id) {
      return optionsOf(fieldKey)?.find((o) => o.id === id)?.label
    },

    /**
     * Return a copy of the record with custom_fields hash keys replaced by
     * human names and option IDs by labels (for table display; JSON output
     * stays raw).
     * @param {object} record
     */
    resolveCustomFields(record) {
      if (!record?.custom_fields) return record

      const resolved = {}
      for (const [key, value] of Object.entries(record.custom_fields)) {
        let name = this.keyToName(key) ?? key
        // Duplicate field names exist in real accounts — disambiguate with
        // a key fragment rather than silently clobbering the first value.
        if (name in resolved) name = `${name} (${key.slice(0, 8)})`
        let displayValue = value
        if (Array.isArray(value)) {
          displayValue = value.map((v) => this.optionIdToLabel(key, v) ?? v)
        } else if (value != null) {
          displayValue = this.optionIdToLabel(key, value) ?? value
        }
        resolved[name] = displayValue
      }
      return { ...record, custom_fields: resolved }
    },
  }
}
