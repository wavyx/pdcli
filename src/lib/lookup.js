import { CliError } from './errors.js'

/** v2 custom-field types that the search endpoints can match on. */
const SEARCHABLE_TYPES = new Set([
  'address',
  'varchar',
  'varchar_auto',
  'text',
  'double',
  'monetary',
  'phone',
])
const NUMERIC_TYPES = new Set(['double', 'monetary'])

/**
 * Per-entity scoped-search config + built-in match fields. Each built-in gives
 * the search `fields` scope, how to pull the comparable value(s) off a result
 * record, and whether the compare is case-insensitive.
 */
const SEARCH_CONFIG = {
  person: {
    searchPath: '/api/v2/persons/search',
    builtins: {
      email: {
        scope: 'email',
        extract: (it) => (it.emails ?? []).map((e) => e.value),
        ci: true,
      },
      name: { scope: 'name', extract: (it) => [it.name], ci: false },
      phone: {
        scope: 'phone',
        extract: (it) => (it.phones ?? []).map((p) => p.value),
        ci: false,
      },
    },
  },
  org: {
    searchPath: '/api/v2/organizations/search',
    builtins: {
      name: { scope: 'name', extract: (it) => [it.name], ci: false },
    },
  },
  deal: {
    searchPath: '/api/v2/deals/search',
    builtins: {
      title: { scope: 'title', extract: (it) => [it.title], ci: false },
    },
  },
}

function valuesEqual(actual, expected, ci) {
  if (actual == null) return false
  if (typeof expected === 'number') return Number(actual) === expected
  return ci
    ? String(actual).toLowerCase() === String(expected).toLowerCase()
    : String(actual) === String(expected)
}

/**
 * Find the record of `entity` whose `field` exactly equals `value`. Routes a
 * built-in field (person email/name/phone, org name, deal title) or a
 * searchable custom field (by name) to the scoped /search endpoint, collects
 * ALL matches across cursor pages, then RE-VERIFIES each client-side — because
 * `exact_match` is not a unique-key lookup (it's case-insensitive and, for
 * custom fields, searches every custom field at once). The surviving count
 * decides the tri-state: 0 → create, 1 → update, >1 → caller must refuse.
 *
 * @param {{ get: Function }} client
 * @param {'person'|'org'|'deal'} entity
 * @param {object[]} [defs] field definitions (needed for a custom --by field)
 * @param {string} field built-in name or custom-field name
 * @param {string} value the value to match
 * @returns {Promise<{ status: 'none' } | { status: 'unique', id: number, record: object } | { status: 'ambiguous', matches: number[] }>}
 */
export async function lookupByField({
  client,
  entity,
  defs = [],
  field,
  value,
}) {
  const cfg = SEARCH_CONFIG[entity]
  const builtin = cfg.builtins[field.toLowerCase()]

  let scope
  let extract
  let ci
  let compareValue

  if (builtin) {
    ;({ scope, extract, ci } = builtin)
    compareValue = value
  } else {
    const def = defs.find(
      (d) =>
        d.field_name?.toLowerCase() === field.toLowerCase() ||
        d.field_code === field,
    )
    if (!def) {
      throw new CliError(
        `Unknown field "${field}" for ${entity}. Run: pdcli field list ${entity}`,
        { exitCode: 64 },
      )
    }
    if (!SEARCHABLE_TYPES.has(def.field_type)) {
      throw new CliError(
        `Field "${field}" (${def.field_type}) is not searchable — --by needs a ` +
          `built-in key or a searchable custom field (text/number/phone/address)`,
        { exitCode: 64 },
      )
    }
    scope = 'custom_fields'
    const key = def.field_code
    extract = (it) => [it.custom_fields?.[key]]
    ci = false
    if (NUMERIC_TYPES.has(def.field_type)) {
      compareValue = Number(value)
      // A non-numeric value coerces to NaN, which loses every comparison
      // (NaN !== NaN) — so a match would silently miss and we'd create or
      // inject a NaN value. Refuse loudly instead.
      if (!Number.isFinite(compareValue)) {
        throw new CliError(
          `"${value}" is not a valid number for field "${field}"`,
          { exitCode: 65 },
        )
      }
    } else {
      compareValue = value
    }
  }

  const matches = []
  let cursor
  do {
    const body = await client.get(cfg.searchPath, {
      query: {
        term: value,
        exact_match: true,
        fields: scope,
        limit: 500,
        cursor,
      },
    })
    for (const entry of body.data?.items ?? []) matches.push(entry.item)
    cursor = body.additional_data?.next_cursor ?? null
  } while (cursor)

  const survivors = matches.filter((item) =>
    extract(item).some((v) => valuesEqual(v, compareValue, ci)),
  )

  if (survivors.length === 0) return { status: 'none' }
  if (survivors.length === 1) {
    return { status: 'unique', id: survivors[0].id, record: survivors[0] }
  }
  return { status: 'ambiguous', matches: survivors.map((s) => s.id) }
}
