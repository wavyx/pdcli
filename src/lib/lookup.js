import { CliError } from './errors.js'

/**
 * v2 custom-field types that the search endpoints can match on. NOTE:
 * `monetary` and `address` are deliberately excluded — v2 returns them as
 * objects ({ value, currency } / { value, … }) on the full record, so the
 * scalar comparison below never matches and every upsert would create a
 * duplicate. Until the object shape is supported on both read and write,
 * --by on those types is refused (exit 64) rather than silently duplicating.
 */
const SEARCHABLE_TYPES = new Set([
  'varchar',
  'varchar_auto',
  'text',
  'double',
  'phone',
])
const NUMERIC_TYPES = new Set(['double', 'monetary'])

/**
 * Per-entity config: the scoped-search endpoint, the record-fetch base, and
 * the built-in match fields. Each built-in gives the search `fields` scope,
 * how to pull the comparable value(s) off the *full* record (NOT the search
 * item — see lookupByField), and whether the compare is case-insensitive.
 */
const SEARCH_CONFIG = {
  person: {
    searchPath: '/api/v2/persons/search',
    recordPath: '/api/v2/persons',
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
    recordPath: '/api/v2/organizations',
    builtins: {
      name: { scope: 'name', extract: (it) => [it.name], ci: false },
    },
  },
  deal: {
    searchPath: '/api/v2/deals/search',
    recordPath: '/api/v2/deals',
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
 * searchable custom field (by name) to the scoped /search endpoint to collect
 * candidate ids across cursor pages, then FETCHES each candidate's full record
 * and RE-VERIFIES it client-side. The fetch is not optional: the search result
 * `item` is a lossy projection (emails/phones come back as bare strings,
 * custom_fields as an unattributed value array) so it can neither be trusted
 * for verification nor used as the record to diff against. `exact_match` is
 * also not a unique-key lookup (case-insensitive; a custom-field search scans
 * every custom field at once), which is the other reason to re-verify against
 * the authoritative record. The surviving count decides the tri-state:
 * 0 → create, 1 → update, >1 → caller must refuse.
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
          `built-in key or a searchable custom field (text/number/phone)`,
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

  // 1. Collect candidate ids from the scoped exact_match search (the cheap
  //    finder). The item body is lossy, so we keep only the id.
  const candidateIds = []
  const seen = new Set()
  let cursor
  do {
    const body = await client.get(cfg.searchPath, {
      query: {
        term: value,
        exact_match: true,
        fields: scope,
        // The per-entity /search endpoints cap limit at 100 (the live API 400s
        // on more, despite the 500 list cap); cursor paging collects the rest.
        limit: 100,
        cursor,
      },
    })
    for (const entry of body.data?.items ?? []) {
      const id = entry.item?.id
      if (id != null && !seen.has(id)) {
        seen.add(id)
        candidateIds.push(id)
      }
    }
    cursor = body.additional_data?.next_cursor ?? null
  } while (cursor)

  // 2. Fetch each candidate's full record and re-verify the matched field
  //    against its authoritative value(s). The surviving records are both the
  //    ambiguity count and (when unique) the record to diff against.
  const survivors = []
  for (const id of candidateIds) {
    const record = (await client.get(`${cfg.recordPath}/${id}`)).data
    if (
      record &&
      extract(record).some((v) => valuesEqual(v, compareValue, ci))
    ) {
      survivors.push(record)
    }
  }

  if (survivors.length === 0) return { status: 'none' }
  if (survivors.length === 1) {
    return { status: 'unique', id: survivors[0].id, record: survivors[0] }
  }
  return { status: 'ambiguous', matches: survivors.map((s) => s.id) }
}
