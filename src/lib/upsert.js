import { CliError } from './errors.js'
import { eq } from './backup-diff.js'
import { lookupByField } from './lookup.js'

/** Entity → v2 write path. */
const WRITE_PATH = {
  person: '/api/v2/persons',
  org: '/api/v2/organizations',
  deal: '/api/v2/deals',
}

const NUMERIC_TYPES = new Set(['double', 'monetary'])

/**
 * Inject the match field+value into a CREATE body (so a created record actually
 * carries the value it was matched on). `??=` so an explicit body value wins.
 */
function injectMatch(body, entity, field, value, defs) {
  const key = field.toLowerCase()
  if (entity === 'person' && key === 'email') {
    body.emails ??= [{ value, primary: true }]
    return
  }
  if (entity === 'person' && key === 'phone') {
    body.phones ??= [{ value, primary: true }]
    return
  }
  if ((entity === 'person' || entity === 'org') && key === 'name') {
    body.name ??= value
    return
  }
  if (entity === 'deal' && key === 'title') {
    body.title ??= value
    return
  }
  // custom field
  const def = defs.find(
    (d) => d.field_name?.toLowerCase() === key || d.field_code === field,
  )
  body.custom_fields ??= {}
  body.custom_fields[def.field_code] ??= NUMERIC_TYPES.has(def.field_type)
    ? Number(value)
    : value
}

/**
 * Field-level diff for an idempotent PATCH: the subset of `incoming` whose
 * value differs from `existing`. Top-level fields compare directly; the nested
 * v2 `custom_fields` object is diffed key by key. Equality is key-order
 * insensitive. An empty result means "no change → skip the PATCH".
 * @param {object} incoming the desired body
 * @param {object} existing the current record
 * @returns {object} the changed-only body
 */
export function diffBody(incoming, existing) {
  const changed = {}
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'custom_fields' && value && typeof value === 'object') {
      const cf = {}
      for (const [ck, cv] of Object.entries(value)) {
        if (!eq(cv, existing?.custom_fields?.[ck])) cf[ck] = cv
      }
      if (Object.keys(cf).length > 0) changed.custom_fields = cf
    } else if (!eq(value, existing?.[key])) {
      changed[key] = value
    }
  }
  return changed
}

/**
 * Idempotent match-or-create. Looks up `entity` by `by`=`value`:
 *   - 0 matches → create (the match field is injected into the body)
 *   - 1 match   → PATCH only the fields that differ (diffBody); none → unchanged
 *   - >1 match  → refuse (exit 65) — never guess which to write
 *
 * @param {{ get, post, patch }} client
 * @param {'person'|'org'|'deal'} entity
 * @param {string} by match field (built-in or searchable custom field)
 * @param {string} value match value
 * @param {object} body desired write body (from buildWriteBody)
 * @param {object[]} [defs] field definitions (for custom --by + injection)
 * @param {boolean} [dryRun]
 * @returns {Promise<{ action: 'created'|'updated'|'unchanged', id?: number,
 *   changed?: object, dryRun?: boolean, record?: object }>}
 */
export async function runUpsert({
  client,
  entity,
  by,
  value,
  body,
  defs = [],
  dryRun = false,
}) {
  const writePath = WRITE_PATH[entity]
  const match = await lookupByField({ client, entity, defs, field: by, value })

  if (match.status === 'ambiguous') {
    throw new CliError(
      `--by ${by}="${value}" matches ${match.matches.length} ${entity} records ` +
        `(ids: ${match.matches.join(', ')}) — refusing to guess. Narrow the match value.`,
      { exitCode: 65 },
    )
  }

  if (match.status === 'none') {
    const createBody = { ...body }
    injectMatch(createBody, entity, by, value, defs)
    if (dryRun) return { action: 'created', dryRun: true, body: createBody }
    const res = await client.post(writePath, { body: createBody })
    return { action: 'created', id: res.data?.id, record: res.data }
  }

  // unique → diff-before-PATCH
  const changed = diffBody(body, match.record)
  if (Object.keys(changed).length === 0) {
    return { action: 'unchanged', id: match.id }
  }
  if (dryRun) return { action: 'updated', id: match.id, dryRun: true, changed }
  const res = await client.patch(`${writePath}/${match.id}`, { body: changed })
  return { action: 'updated', id: match.id, changed, record: res.data }
}
