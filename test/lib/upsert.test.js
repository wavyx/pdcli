import { describe, it, expect } from 'vitest'
import { diffBody, runUpsert } from '../../src/lib/upsert.js'

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
