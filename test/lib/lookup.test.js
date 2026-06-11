import { describe, it, expect } from 'vitest'
import { lookupByField } from '../../src/lib/lookup.js'

/**
 * Fake client modelling the two-step lookup: a `/search` GET returns lossy
 * candidate items (id only is used), and a record-fetch GET
 * (`/api/v2/<entity>/<id>`) returns the authoritative full record. `records`
 * maps id → full record; `searchPages` is the queued list of search pages.
 */
function fakeClient({ searchPages = [], records = {} } = {}) {
  let i = 0
  const calls = []
  return {
    calls,
    async get(path, opts) {
      calls.push({ path, query: opts?.query })
      if (path.endsWith('/search')) {
        return searchPages[i++] ?? { data: { items: [] } }
      }
      const id = Number(path.split('/').pop())
      return { data: records[id] ?? null }
    },
  }
}

/** A search page advertising candidate ids; full bodies live in `records`. */
const page = (ids, next = null) => ({
  data: { items: ids.map((id) => ({ item: { id } })) },
  additional_data: { next_cursor: next },
})

describe('lookupByField', () => {
  it('returns none when nothing matches', async () => {
    const client = fakeClient({ searchPages: [page([])] })
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r.status).toBe('none')
  })

  it('returns unique with the id for exactly one verified match', async () => {
    const client = fakeClient({
      searchPages: [page([7])],
      records: { 7: { id: 7, emails: [{ value: 'a@x.com' }] } },
    })
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r).toMatchObject({ status: 'unique', id: 7 })
    expect(r.record).toEqual({ id: 7, emails: [{ value: 'a@x.com' }] })
  })

  it('refuses (ambiguous) on more than one verified match', async () => {
    const client = fakeClient({
      searchPages: [page([7, 8])],
      records: {
        7: { id: 7, emails: [{ value: 'a@x.com' }] },
        8: { id: 8, emails: [{ value: 'a@x.com' }] },
      },
    })
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r.status).toBe('ambiguous')
    expect(r.matches).toEqual([7, 8])
  })

  it('matches email case-insensitively', async () => {
    const client = fakeClient({
      searchPages: [page([7])],
      records: { 7: { id: 7, emails: [{ value: 'A@X.com' }] } },
    })
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r).toMatchObject({ status: 'unique', id: 7 })
  })

  it('re-verifies the full record, discarding a search over-match', async () => {
    // search leaked a non-matching person (exact_match is not a unique key);
    // the fetched record proves its email differs.
    const client = fakeClient({
      searchPages: [page([9])],
      records: { 9: { id: 9, emails: [{ value: 'other@x.com' }] } },
    })
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r.status).toBe('none')
  })

  it('sends exact_match and the scoped fields/limit, then fetches the record', async () => {
    const client = fakeClient({
      searchPages: [page([5])],
      records: { 5: { id: 5, name: 'Acme' } },
    })
    await lookupByField({ client, entity: 'org', field: 'name', value: 'Acme' })
    expect(client.calls[0]).toMatchObject({
      path: '/api/v2/organizations/search',
      // Per-entity search caps limit at 100 (NOT the 500 list cap) — the live
      // API 400s on limit > 100.
      query: { term: 'Acme', exact_match: true, fields: 'name', limit: 100 },
    })
    expect(client.calls[1].path).toBe('/api/v2/organizations/5')
  })

  it('pages through next_cursor before fetching candidates', async () => {
    const client = fakeClient({
      searchPages: [page([1], 'CUR'), page([2])],
      records: { 1: { id: 1, name: 'Acme' }, 2: { id: 2, name: 'Acme' } },
    })
    const r = await lookupByField({
      client,
      entity: 'org',
      field: 'name',
      value: 'Acme',
    })
    expect(r.status).toBe('ambiguous')
    const searches = client.calls.filter((c) => c.path.endsWith('/search'))
    expect(searches).toHaveLength(2)
    expect(searches[1].query.cursor).toBe('CUR')
  })

  it('de-duplicates a candidate id that the search repeats across pages', async () => {
    const client = fakeClient({
      searchPages: [page([7], 'CUR'), page([7])],
      records: { 7: { id: 7, name: 'Acme' } },
    })
    const r = await lookupByField({
      client,
      entity: 'org',
      field: 'name',
      value: 'Acme',
    })
    expect(r).toMatchObject({ status: 'unique', id: 7 })
    const fetches = client.calls.filter(
      (c) => c.path === '/api/v2/organizations/7',
    )
    expect(fetches).toHaveLength(1)
  })

  it('matches a searchable custom field by name, verifying the hash key', async () => {
    const defs = [
      {
        field_name: 'External ID',
        field_code: 'abc123',
        field_type: 'varchar',
      },
    ]
    const client = fakeClient({
      searchPages: [page([5, 6])],
      records: {
        5: { id: 5, custom_fields: { abc123: 'D-42' } },
        6: { id: 6, custom_fields: { abc123: 'D-99' } }, // verify drops it
      },
    })
    const r = await lookupByField({
      client,
      entity: 'deal',
      defs,
      field: 'External ID',
      value: 'D-42',
    })
    expect(r).toMatchObject({ status: 'unique', id: 5 })
    expect(client.calls[0].query.fields).toBe('custom_fields')
  })

  it('coerces numeric custom-field values for comparison', async () => {
    const defs = [
      { field_name: 'Score', field_code: 'sc', field_type: 'double' },
    ]
    const client = fakeClient({
      searchPages: [page([5])],
      records: { 5: { id: 5, custom_fields: { sc: 42 } } },
    })
    const r = await lookupByField({
      client,
      entity: 'deal',
      defs,
      field: 'Score',
      value: '42',
    })
    expect(r).toMatchObject({ status: 'unique', id: 5 })
  })

  it('matches a deal by title', async () => {
    const client = fakeClient({
      searchPages: [page([3])],
      records: { 3: { id: 3, title: 'Acme expansion' } },
    })
    const r = await lookupByField({
      client,
      entity: 'deal',
      field: 'title',
      value: 'Acme expansion',
    })
    expect(r).toMatchObject({ status: 'unique', id: 3 })
    expect(client.calls[0].query.fields).toBe('title')
  })

  it('matches a person by name or phone (with empty-array tolerance)', async () => {
    const byName = await lookupByField({
      client: fakeClient({
        searchPages: [page([1])],
        records: { 1: { id: 1, name: 'Jane Doe', phones: [] } },
      }),
      entity: 'person',
      field: 'name',
      value: 'Jane Doe',
    })
    expect(byName).toMatchObject({ status: 'unique', id: 1 })

    const byPhone = await lookupByField({
      client: fakeClient({
        searchPages: [page([2])],
        records: { 2: { id: 2, phones: [{ value: '+15551234' }], emails: [] } },
      }),
      entity: 'person',
      field: 'phone',
      value: '+15551234',
    })
    expect(byPhone).toMatchObject({ status: 'unique', id: 2 })
  })

  it('accepts a custom field referenced by its hash code', async () => {
    const defs = [
      {
        field_name: 'External ID',
        field_code: 'abc123',
        field_type: 'varchar',
      },
    ]
    const client = fakeClient({
      searchPages: [page([5])],
      records: { 5: { id: 5, custom_fields: { abc123: 'D-42' } } },
    })
    const r = await lookupByField({
      client,
      entity: 'deal',
      defs,
      field: 'abc123',
      value: 'D-42',
    })
    expect(r).toMatchObject({ status: 'unique', id: 5 })
  })

  it('tolerates a malformed search response (no data/cursor)', async () => {
    const client = fakeClient({ searchPages: [{}] })
    const r = await lookupByField({
      client,
      entity: 'org',
      field: 'name',
      value: 'Acme',
    })
    expect(r.status).toBe('none')
  })

  it('tolerates a candidate whose fetched record is null', async () => {
    const client = fakeClient({ searchPages: [page([1])], records: {} })
    const r = await lookupByField({
      client,
      entity: 'org',
      field: 'name',
      value: 'Acme',
    })
    expect(r.status).toBe('none')
  })

  it('skips a search item without an id', async () => {
    const client = fakeClient({
      searchPages: [{ data: { items: [{ item: {} }] } }],
    })
    const r = await lookupByField({
      client,
      entity: 'org',
      field: 'name',
      value: 'Acme',
    })
    expect(r.status).toBe('none')
  })

  it('tolerates fetched records missing the matched field', async () => {
    const noEmail = await lookupByField({
      client: fakeClient({
        searchPages: [page([1])],
        records: { 1: { id: 1 } },
      }),
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(noEmail.status).toBe('none')

    const noCustom = await lookupByField({
      client: fakeClient({
        searchPages: [page([2])],
        records: { 2: { id: 2 } },
      }),
      entity: 'deal',
      defs: [
        { field_name: 'External ID', field_code: 'k', field_type: 'varchar' },
      ],
      field: 'External ID',
      value: 'D-1',
    })
    expect(noCustom.status).toBe('none')

    const noPhone = await lookupByField({
      client: fakeClient({
        searchPages: [page([3])],
        records: { 3: { id: 3 } },
      }),
      entity: 'person',
      field: 'phone',
      value: '+1555',
    })
    expect(noPhone.status).toBe('none')
  })

  it('rejects a non-numeric value for a numeric custom field with exit 65', async () => {
    const defs = [
      { field_name: 'Score', field_code: 'sc', field_type: 'double' },
    ]
    const err = await lookupByField({
      client: fakeClient({}),
      entity: 'deal',
      defs,
      field: 'Score',
      value: 'notanumber',
    }).catch((e) => e)
    expect(err.exitCode).toBe(65)
    expect(err.message).toMatch(/number/i)
  })

  it('rejects a non-searchable field type with exit 64', async () => {
    const defs = [
      { field_name: 'Stage Color', field_code: 'cc', field_type: 'enum' },
    ]
    const err = await lookupByField({
      client: fakeClient({}),
      entity: 'deal',
      defs,
      field: 'Stage Color',
      value: 'Red',
    }).catch((e) => e)
    expect(err.exitCode).toBe(64)
    expect(err.message).toMatch(/not searchable/i)
  })

  it('rejects an unknown field with exit 64', async () => {
    const err = await lookupByField({
      client: fakeClient({}),
      entity: 'deal',
      defs: [],
      field: 'Nonexistent',
      value: 'x',
    }).catch((e) => e)
    expect(err.exitCode).toBe(64)
    expect(err.message).toMatch(/unknown field/i)
  })
})
