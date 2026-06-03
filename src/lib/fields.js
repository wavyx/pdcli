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
 * @param {string} entity deal | person | org(anization) | product | activity
 * @returns {string} v2 fields endpoint path
 */
export function entityToFieldsPath(entity) {
  const resource = ENTITY_FIELDS[entity]
  if (!resource) {
    throw new CliError(
      `Unknown entity "${entity}". Use one of: ${Object.keys(ENTITY_FIELDS).join(', ')}`,
      { exitCode: 64 },
    )
  }
  return `/api/v2/${resource}`
}

/** @type {Map<string, object[]>} per-run field-definition cache */
const cache = new Map()

export function clearFieldsCache() {
  cache.clear()
}

/**
 * Fetch (and memoize for this run) all field definitions for an entity.
 * @param {{ pageV2: (path: string) => AsyncGenerator<object> }} client
 * @param {string} entity
 * @returns {Promise<object[]>}
 */
export async function getFields(client, entity) {
  const path = entityToFieldsPath(entity)
  if (cache.has(path)) return cache.get(path)

  debug('fetching field definitions: %s', path)
  const defs = []
  for await (const def of client.pageV2(path)) {
    defs.push(def)
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
        const name = this.keyToName(key) ?? key
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
