import { CliError } from './errors.js'
import { eq } from './backup-diff.js'
import { lookupByField } from './lookup.js'
import { getFields } from './fields.js'
import { buildWriteBody } from './input.js'
import { bulkRun } from './bulk.js'

/** Entity → v2 write path. */
const WRITE_PATH = {
  person: '/api/v2/persons',
  org: '/api/v2/organizations',
  deal: '/api/v2/deals',
}

const NUMERIC_TYPES = new Set(['double', 'monetary'])

/**
 * Resolve which body key the match field `field` writes to: a root key
 * (emails/phones/name/title) or a `custom_fields` hash code. Shared by
 * injectMatch (create) and stripMatchField (update) so the two never drift.
 * @returns {{ root?: string, custom?: string, def?: object }}
 */
function matchFieldTarget(entity, field, defs) {
  const key = field.toLowerCase()
  if (entity === 'person' && key === 'email') return { root: 'emails' }
  if (entity === 'person' && key === 'phone') return { root: 'phones' }
  if ((entity === 'person' || entity === 'org') && key === 'name') {
    return { root: 'name' }
  }
  if (entity === 'deal' && key === 'title') return { root: 'title' }
  const def = defs.find(
    (d) => d.field_name?.toLowerCase() === key || d.field_code === field,
  )
  return { custom: def?.field_code, def }
}

/**
 * Inject the match field+value into a CREATE body (so a created record actually
 * carries the value it was matched on). `??=` so an explicit body value wins.
 */
function injectMatch(body, entity, field, value, defs) {
  const t = matchFieldTarget(entity, field, defs)
  if (t.root === 'emails') {
    body.emails ??= [{ value, primary: true }]
  } else if (t.root === 'phones') {
    body.phones ??= [{ value, primary: true }]
  } else if (t.root) {
    body[t.root] ??= value
  } else {
    body.custom_fields ??= {}
    body.custom_fields[t.custom] ??= NUMERIC_TYPES.has(t.def.field_type)
      ? Number(value)
      : value
  }
}

/**
 * Remove the match (identity) field from an UPDATE body. The matched record
 * already carries `value` (that's how we found it), so re-writing it is never
 * the intent — and for emails/phones it would narrow the set to just the match
 * value and silently delete the record's other entries (the v0.18 CRITICAL).
 */
function stripMatchField(body, entity, field, defs) {
  const t = matchFieldTarget(entity, field, defs)
  const out = { ...body }
  if (t.root) {
    delete out[t.root]
  } else if (t.custom && out.custom_fields) {
    out.custom_fields = { ...out.custom_fields }
    delete out.custom_fields[t.custom]
  }
  return out
}

/** True if every element of an array is a primitive (or null). */
function isPrimitiveArray(value) {
  return (
    Array.isArray(value) &&
    value.every((v) => v == null || typeof v !== 'object')
  )
}

/**
 * Idempotency-aware field equality for diffBody. Beyond key-order insensitive
 * `eq`, it treats two classes of field as equal when they carry the same
 * *content* regardless of incidental shape the API adds back:
 *   - emails/phones: compared by their set of `value`s (case-insensitive),
 *     ignoring the `primary`/`label` flags the API echoes — otherwise an
 *     injected `primary:true` would PATCH on every run.
 *   - set-like primitive arrays (label_ids, multi-option custom fields):
 *     compared order-insensitively, since the API may return them sorted.
 */
function fieldEq(incoming, existing, key) {
  if (
    (key === 'emails' || key === 'phones') &&
    Array.isArray(incoming) &&
    Array.isArray(existing)
  ) {
    const values = (arr) =>
      arr.map((e) => String(e?.value ?? '').toLowerCase()).sort()
    return eq(values(incoming), values(existing))
  }
  if (isPrimitiveArray(incoming) && isPrimitiveArray(existing)) {
    return eq([...incoming].sort(), [...existing].sort())
  }
  return eq(incoming, existing)
}

/**
 * Field-level diff for an idempotent PATCH: the subset of `incoming` whose
 * value differs from `existing`. Top-level fields compare directly; the nested
 * v2 `custom_fields` object is diffed key by key. Equality is key-order
 * insensitive and set-aware for emails/phones/primitive arrays (see fieldEq),
 * so re-running an unchanged upsert produces no PATCH. An empty result means
 * "no change → skip the PATCH".
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
        if (!fieldEq(cv, existing?.custom_fields?.[ck], ck)) cf[ck] = cv
      }
      if (Object.keys(cf).length > 0) changed.custom_fields = cf
    } else if (!fieldEq(value, existing?.[key], key)) {
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

  // unique → diff-before-PATCH (excluding the identity field we matched on)
  const changed = diffBody(
    stripMatchField(body, entity, by, defs),
    match.record,
  )
  if (Object.keys(changed).length === 0) {
    return { action: 'unchanged', id: match.id }
  }
  if (dryRun) return { action: 'updated', id: match.id, dryRun: true, changed }
  const res = await client.patch(`${writePath}/${match.id}`, { body: changed })
  return { action: 'updated', id: match.id, changed, record: res.data }
}

/**
 * Command-facing wrapper: fetch field defs, build the write body from --field /
 * --body, then run the upsert. Keeps the three entity commands trivial.
 * @param {object} options
 * @returns {Promise<object>} the runUpsert result
 */
export async function upsertWithDefs({
  client,
  entity,
  by,
  value,
  fields = [],
  rawBody,
  dryRun = false,
}) {
  const defs = await getFields(client, entity)
  const body = buildWriteBody({ fields, rawBody, defs })
  return runUpsert({ client, entity, by, value, body, defs, dryRun })
}

/**
 * Upsert a batch of prepared bodies — one per CSV row — each matched on the
 * shared `matchOn` field using that row's own `value`. Runs sequentially
 * through bulkRun's pacing; a per-row failure (empty match value, ambiguous
 * match, or API error) is collected, never aborting the batch. The surviving
 * results are tallied by action so the caller can report created/updated/
 * unchanged counts.
 *
 * @param {object} options
 * @param {{ get, post, patch }} options.client
 * @param {'person'|'org'|'deal'} options.entity
 * @param {string} options.matchOn the match field shared by every row
 * @param {{ body: object, value: string }[]} options.rows
 * @param {object[]} options.defs field definitions (for a custom match field)
 * @param {boolean} [options.dryRun]
 * @param {number} [options.gapMs] pacing gap forwarded to bulkRun
 * @param {(done: number, total: number) => void} [options.onProgress]
 * @returns {Promise<{ succeeded, failed, counts: { created: number,
 *   updated: number, unchanged: number } }>}
 */
export async function bulkUpsertRows({
  client,
  entity,
  matchOn,
  rows,
  defs = [],
  dryRun = false,
  gapMs,
  onProgress,
}) {
  const summary = await bulkRun(
    rows,
    ({ body, value }) => {
      if (value == null || value === '') {
        throw new CliError(`empty "${matchOn}" value — cannot match a row`, {
          exitCode: 65,
        })
      }
      return runUpsert({
        client,
        entity,
        by: matchOn,
        value,
        body,
        defs,
        dryRun,
      })
    },
    { gapMs, onProgress },
  )

  const counts = { created: 0, updated: 0, unchanged: 0 }
  for (const { result } of summary.succeeded) counts[result.action] += 1
  return { ...summary, counts }
}

/** One-line human summary of an upsert result for table output. */
export function summarizeUpsert(result, entity) {
  const prefix = result.dryRun ? '[dry-run] would ' : ''
  if (result.action === 'unchanged') return `${entity} #${result.id} unchanged`
  if (result.action === 'created') {
    return `${prefix}create ${entity}${result.id != null ? ` #${result.id}` : ''}`
  }
  const n = result.changed ? Object.keys(result.changed).length : 0
  return `${prefix}update ${entity} #${result.id} (${n} field${n === 1 ? '' : 's'})`
}
