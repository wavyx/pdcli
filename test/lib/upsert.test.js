import { describe, it, expect } from 'vitest'
import {
  diffBody,
  runUpsert,
  summarizeUpsert,
  bulkUpsertRows,
} from '../../src/lib/upsert.js'

describe('diffBody', () => {
  it('returns only the changed top-level fields', () => {
    expect(
      diffBody({ title: 'B', value: 100 }, { title: 'A', value: 100 }),
    ).toEqual({
      title: 'B',
    })
  })

  it('diffs nested custom_fields key by key', () => {
    expect(
      diffBody(
        { custom_fields: { a: 1, b: 2 } },
        { custom_fields: { a: 1, b: 9 } },
      ),
    ).toEqual({ custom_fields: { b: 2 } })
  })

  it('includes a field the existing record lacks', () => {
    expect(diffBody({ value: 5 }, {})).toEqual({ value: 5 })
  })

  it('returns empty when nothing changed (key-order insensitive)', () => {
    expect(
      diffBody({ meta: { x: 1, y: 2 } }, { meta: { y: 2, x: 1 } }),
    ).toEqual({})
  })

  it('omits custom_fields entirely when no custom value changed', () => {
    expect(
      diffBody({ custom_fields: { a: 1 } }, { custom_fields: { a: 1 } }),
    ).toEqual({})
  })
})

/** Fake client: queued search items for lookup + captured post/patch. */
function fakeClient({ items = [] } = {}) {
  const calls = { post: [], patch: [] }
  return {
    calls,
    async get() {
      return {
        data: { items: items.map((item) => ({ item })) },
        additional_data: { next_cursor: null },
      }
    },
    async post(path, opts) {
      calls.post.push({ path, body: opts.body })
      return { data: { id: 99, ...opts.body } }
    },
    async patch(path, opts) {
      calls.patch.push({ path, body: opts.body })
      return { data: { id: 7, ...opts.body } }
    },
  }
}

describe('runUpsert', () => {
  it('creates when no match, injecting the match field into the body', async () => {
    const client = fakeClient({ items: [] })
    const r = await runUpsert({
      client,
      entity: 'person',
      by: 'email',
      value: 'a@x.com',
      body: {},
    })
    expect(r).toMatchObject({ action: 'created', id: 99 })
    expect(client.calls.post[0]).toMatchObject({
      path: '/api/v2/persons',
      body: { emails: [{ value: 'a@x.com', primary: true }] },
    })
  })

  it('updates only the changed fields when exactly one matches', async () => {
    const client = fakeClient({
      items: [
        { id: 7, emails: [{ value: 'a@x.com' }], custom_fields: { k: 6 } },
      ],
    })
    const r = await runUpsert({
      client,
      entity: 'person',
      by: 'email',
      value: 'a@x.com',
      body: { custom_fields: { k: 5 } },
    })
    expect(r).toMatchObject({ action: 'updated', id: 7 })
    expect(client.calls.patch[0]).toMatchObject({
      path: '/api/v2/persons/7',
      body: { custom_fields: { k: 5 } },
    })
  })

  it('reports unchanged and issues no PATCH when nothing differs', async () => {
    const client = fakeClient({
      items: [
        { id: 7, emails: [{ value: 'a@x.com' }], custom_fields: { k: 5 } },
      ],
    })
    const r = await runUpsert({
      client,
      entity: 'person',
      by: 'email',
      value: 'a@x.com',
      body: { custom_fields: { k: 5 } },
    })
    expect(r).toMatchObject({ action: 'unchanged', id: 7 })
    expect(client.calls.patch).toHaveLength(0)
  })

  it('refuses an ambiguous match with exit 65', async () => {
    const client = fakeClient({
      items: [
        { id: 7, emails: [{ value: 'a@x.com' }] },
        { id: 8, emails: [{ value: 'a@x.com' }] },
      ],
    })
    const err = await runUpsert({
      client,
      entity: 'person',
      by: 'email',
      value: 'a@x.com',
      body: {},
    }).catch((e) => e)
    expect(err.exitCode).toBe(65)
    expect(err.message).toMatch(/7.*8|8.*7/)
  })

  it('dry-run create writes nothing', async () => {
    const client = fakeClient({ items: [] })
    const r = await runUpsert({
      client,
      entity: 'org',
      by: 'name',
      value: 'Acme',
      body: {},
      dryRun: true,
    })
    expect(r).toMatchObject({ action: 'created', dryRun: true })
    expect(client.calls.post).toHaveLength(0)
  })

  it('dry-run update writes nothing but reports the change set', async () => {
    const client = fakeClient({ items: [{ id: 3, title: 'Acme', value: 1 }] })
    const r = await runUpsert({
      client,
      entity: 'deal',
      by: 'title',
      value: 'Acme',
      body: { value: 2 },
      dryRun: true,
    })
    expect(r).toMatchObject({ action: 'updated', id: 3, dryRun: true })
    expect(r.changed).toEqual({ value: 2 })
    expect(client.calls.patch).toHaveLength(0)
  })

  it('injects a custom match field into the create body', async () => {
    const defs = [
      { field_name: 'External ID', field_code: 'ext', field_type: 'varchar' },
    ]
    const client = fakeClient({ items: [] })
    await runUpsert({
      client,
      entity: 'deal',
      by: 'External ID',
      value: 'D-42',
      body: {},
      defs,
    })
    expect(client.calls.post[0].body.custom_fields).toEqual({ ext: 'D-42' })
  })

  it('injects a phone match field when creating a person by phone', async () => {
    const client = fakeClient({ items: [] })
    await runUpsert({
      client,
      entity: 'person',
      by: 'phone',
      value: '+15551234',
      body: {},
    })
    expect(client.calls.post[0].body.phones).toEqual([
      { value: '+15551234', primary: true },
    ])
  })

  it('injects a title match field when creating a deal by title', async () => {
    const client = fakeClient({ items: [] })
    await runUpsert({
      client,
      entity: 'deal',
      by: 'title',
      value: 'Acme expansion',
      body: {},
    })
    expect(client.calls.post[0].body.title).toBe('Acme expansion')
  })

  it('injects a numeric custom match field, preserving other custom fields', async () => {
    const defs = [
      { field_name: 'Score', field_code: 'sc', field_type: 'double' },
      { field_name: 'Region', field_code: 'rg', field_type: 'varchar' },
    ]
    const client = fakeClient({ items: [] })
    await runUpsert({
      client,
      entity: 'deal',
      by: 'Score',
      value: '42',
      body: { custom_fields: { rg: 'EMEA' } },
      defs,
    })
    expect(client.calls.post[0].body.custom_fields).toEqual({
      rg: 'EMEA',
      sc: 42,
    })
  })

  it('does not clobber an explicit body value with the injected match field', async () => {
    const client = fakeClient({ items: [] })
    await runUpsert({
      client,
      entity: 'org',
      by: 'name',
      value: 'Acme',
      body: { name: 'Acme Corporation' }, // explicit wins
    })
    expect(client.calls.post[0].body.name).toBe('Acme Corporation')
  })

  it('matches a custom field referenced by hash code (no field_name)', async () => {
    const defs = [{ field_code: 'ext', field_type: 'varchar' }] // no field_name
    const client = fakeClient({ items: [] })
    await runUpsert({
      client,
      entity: 'deal',
      by: 'ext',
      value: 'D-1',
      body: {},
      defs,
    })
    expect(client.calls.post[0].body.custom_fields).toEqual({ ext: 'D-1' })
  })

  it('does not clobber an explicit custom match value', async () => {
    const defs = [
      { field_name: 'External ID', field_code: 'ext', field_type: 'varchar' },
    ]
    const client = fakeClient({ items: [] })
    await runUpsert({
      client,
      entity: 'deal',
      by: 'External ID',
      value: 'D-42',
      body: { custom_fields: { ext: 'EXPLICIT' } },
      defs,
    })
    expect(client.calls.post[0].body.custom_fields.ext).toBe('EXPLICIT')
  })
})

describe('summarizeUpsert', () => {
  it('counts changed fields, pluralizing past one', () => {
    expect(
      summarizeUpsert({ action: 'updated', id: 7, changed: { a: 1 } }, 'deal'),
    ).toBe('update deal #7 (1 field)')
    expect(
      summarizeUpsert(
        { action: 'updated', id: 7, changed: { a: 1, b: 2 } },
        'deal',
      ),
    ).toBe('update deal #7 (2 fields)')
  })

  it('treats an updated result with no change set as zero fields', () => {
    expect(summarizeUpsert({ action: 'updated', id: 7 }, 'deal')).toBe(
      'update deal #7 (0 fields)',
    )
  })

  it('prefixes dry-run and omits the id when a created record has none', () => {
    expect(summarizeUpsert({ action: 'created', dryRun: true }, 'org')).toBe(
      '[dry-run] would create org',
    )
    expect(summarizeUpsert({ action: 'created', id: 5 }, 'org')).toBe(
      'create org #5',
    )
  })

  it('reports an unchanged record', () => {
    expect(summarizeUpsert({ action: 'unchanged', id: 7 }, 'person')).toBe(
      'person #7 unchanged',
    )
  })
})

/** Fake client whose search results vary by the search `term`. */
function termFakeClient(byTerm = {}) {
  const calls = { post: [], patch: [], terms: [] }
  return {
    calls,
    async get(path, opts) {
      calls.terms.push(opts.query.term)
      const items = byTerm[opts.query.term] ?? []
      return {
        data: { items: items.map((item) => ({ item })) },
        additional_data: { next_cursor: null },
      }
    },
    async post(path, opts) {
      calls.post.push({ path, body: opts.body })
      return { data: { id: 99, ...opts.body } }
    },
    async patch(path, opts) {
      calls.patch.push({ path, body: opts.body })
      return { data: { ...opts.body } }
    },
  }
}

describe('bulkUpsertRows', () => {
  it('creates new rows, patches existing ones, and tallies actions', async () => {
    const client = termFakeClient({
      'a@x.com': [{ id: 7, emails: [{ value: 'a@x.com' }], owner_id: 1 }],
      'b@x.com': [],
    })
    const r = await bulkUpsertRows({
      client,
      entity: 'person',
      matchOn: 'email',
      rows: [
        { body: { owner_id: 42 }, value: 'a@x.com' },
        { body: { name: 'Bob' }, value: 'b@x.com' },
      ],
      defs: [],
      gapMs: 0,
    })
    expect(r.counts).toEqual({ created: 1, updated: 1, unchanged: 0 })
    expect(client.calls.patch).toHaveLength(1)
    expect(client.calls.post).toHaveLength(1)
  })

  it('counts an already-matching row as unchanged', async () => {
    const client = termFakeClient({
      'a@x.com': [{ id: 7, emails: [{ value: 'a@x.com' }], owner_id: 1 }],
    })
    const r = await bulkUpsertRows({
      client,
      entity: 'person',
      matchOn: 'email',
      rows: [{ body: { owner_id: 1 }, value: 'a@x.com' }],
      defs: [],
      gapMs: 0,
    })
    expect(r.counts).toEqual({ created: 0, updated: 0, unchanged: 1 })
    expect(client.calls.patch).toHaveLength(0)
  })

  it('collects an empty match value as a failed row', async () => {
    const client = termFakeClient({})
    const r = await bulkUpsertRows({
      client,
      entity: 'person',
      matchOn: 'email',
      rows: [{ body: {}, value: '' }],
      defs: [],
      gapMs: 0,
    })
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].error).toMatch(/empty|match/i)
    expect(client.calls.post).toHaveLength(0)
  })

  it('collects an ambiguous match as a failed row without aborting', async () => {
    const client = termFakeClient({
      dup: [
        { id: 1, name: 'dup' },
        { id: 2, name: 'dup' },
      ],
      'ok@x.com': [],
    })
    const r = await bulkUpsertRows({
      client,
      entity: 'org',
      matchOn: 'name',
      rows: [
        { body: {}, value: 'dup' },
        { body: { name: 'ok@x.com' }, value: 'ok@x.com' },
      ],
      defs: [],
      gapMs: 0,
    })
    expect(r.failed).toHaveLength(1)
    expect(r.counts.created).toBe(1)
  })

  it('looks up but never writes under dry-run', async () => {
    const client = termFakeClient({ 'a@x.com': [] })
    const r = await bulkUpsertRows({
      client,
      entity: 'person',
      matchOn: 'email',
      rows: [{ body: {}, value: 'a@x.com' }],
      defs: [],
      dryRun: true,
      gapMs: 0,
    })
    expect(r.counts.created).toBe(1)
    expect(client.calls.post).toHaveLength(0)
  })
})
