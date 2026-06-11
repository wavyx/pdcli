import { describe, it, expect } from 'vitest'
import { lookupByField } from '../../src/lib/lookup.js'

/** Fake client returning queued search pages and capturing queries. */
function fakeClient(pages) {
  let i = 0
  const calls = []
  return {
    calls,
    async get(path, opts) {
      calls.push({ path, query: opts?.query })
      return pages[i++] ?? { data: { items: [] } }
    },
  }
}
const page = (items, next = null) => ({
  data: { items: items.map((item) => ({ item })) },
  additional_data: { next_cursor: next },
})

describe('lookupByField', () => {
  it('returns none when nothing matches', async () => {
    const client = fakeClient([page([])])
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r.status).toBe('none')
  })

  it('returns unique with the id for exactly one match', async () => {
    const client = fakeClient([
      page([{ id: 7, emails: [{ value: 'a@x.com' }] }]),
    ])
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r).toMatchObject({ status: 'unique', id: 7 })
  })

  it('refuses (ambiguous) on more than one verified match', async () => {
    const client = fakeClient([
      page([
        { id: 7, emails: [{ value: 'a@x.com' }] },
        { id: 8, emails: [{ value: 'a@x.com' }] },
      ]),
    ])
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
    const client = fakeClient([
      page([{ id: 7, emails: [{ value: 'A@X.com' }] }]),
    ])
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r).toMatchObject({ status: 'unique', id: 7 })
  })

  it('re-verifies client-side, discarding search over-matches', async () => {
    // search leaked a non-matching person (exact_match is not a unique key)
    const client = fakeClient([
      page([{ id: 9, emails: [{ value: 'other@x.com' }] }]),
    ])
    const r = await lookupByField({
      client,
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(r.status).toBe('none')
  })

  it('sends exact_match and the scoped fields param', async () => {
    const client = fakeClient([page([])])
    await lookupByField({
      client,
      entity: 'org',
      field: 'name',
      value: 'Acme',
    })
    expect(client.calls[0]).toMatchObject({
      path: '/api/v2/organizations/search',
      query: { term: 'Acme', exact_match: true, fields: 'name' },
    })
  })

  it('pages through next_cursor before deciding ambiguity', async () => {
    const client = fakeClient([
      page([{ id: 1, name: 'Acme' }], 'CUR'),
      page([{ id: 2, name: 'Acme' }]),
    ])
    const r = await lookupByField({
      client,
      entity: 'org',
      field: 'name',
      value: 'Acme',
    })
    expect(r.status).toBe('ambiguous')
    expect(client.calls).toHaveLength(2)
    expect(client.calls[1].query.cursor).toBe('CUR')
  })

  it('matches a searchable custom field by name, verifying the hash key', async () => {
    const defs = [
      {
        field_name: 'External ID',
        field_code: 'abc123',
        field_type: 'varchar',
      },
    ]
    const client = fakeClient([
      page([
        { id: 5, custom_fields: { abc123: 'D-42' } },
        { id: 6, custom_fields: { abc123: 'D-99' } }, // search leaked; verify drops it
      ]),
    ])
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
    const client = fakeClient([page([{ id: 5, custom_fields: { sc: 42 } }])])
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
    const client = fakeClient([page([{ id: 3, title: 'Acme expansion' }])])
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
      client: fakeClient([page([{ id: 1, name: 'Jane Doe', phones: [] }])]),
      entity: 'person',
      field: 'name',
      value: 'Jane Doe',
    })
    expect(byName).toMatchObject({ status: 'unique', id: 1 })

    const byPhone = await lookupByField({
      client: fakeClient([
        page([{ id: 2, phones: [{ value: '+15551234' }], emails: [] }]),
      ]),
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
    const client = fakeClient([
      page([{ id: 5, custom_fields: { abc123: 'D-42' } }]),
    ])
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
    const client = fakeClient([{}]) // no .data, no .additional_data
    const r = await lookupByField({
      client,
      entity: 'org',
      field: 'name',
      value: 'Acme',
    })
    expect(r.status).toBe('none')
  })

  it('tolerates records missing the matched field', async () => {
    const noEmail = await lookupByField({
      client: fakeClient([page([{ id: 1 }])]), // no emails property
      entity: 'person',
      field: 'email',
      value: 'a@x.com',
    })
    expect(noEmail.status).toBe('none')

    const noCustom = await lookupByField({
      client: fakeClient([page([{ id: 2 }])]), // no custom_fields property
      entity: 'deal',
      defs: [
        { field_name: 'External ID', field_code: 'k', field_type: 'varchar' },
      ],
      field: 'External ID',
      value: 'D-1',
    })
    expect(noCustom.status).toBe('none')

    const noPhone = await lookupByField({
      client: fakeClient([page([{ id: 3 }])]), // no phones property
      entity: 'person',
      field: 'phone',
      value: '+1555',
    })
    expect(noPhone.status).toBe('none')
  })

  it('rejects a non-searchable field type with exit 64', async () => {
    const defs = [
      { field_name: 'Stage Color', field_code: 'cc', field_type: 'enum' },
    ]
    const err = await lookupByField({
      client: fakeClient([]),
      entity: 'deal',
      defs,
      field: 'Stage Color',
      value: 'Red',
    }).catch((e) => e)
    expect(err.exitCode).toBe(64)
    expect(err.message).toMatch(/not searchable/i)
  })

  it('rejects a non-numeric value for a numeric custom field with exit 65', async () => {
    const defs = [
      { field_name: 'Score', field_code: 'sc', field_type: 'double' },
    ]
    const err = await lookupByField({
      client: fakeClient([]),
      entity: 'deal',
      defs,
      field: 'Score',
      value: 'notanumber',
    }).catch((e) => e)
    expect(err.exitCode).toBe(65)
    expect(err.message).toMatch(/number/i)
  })

  it('rejects an unknown field with exit 64', async () => {
    const err = await lookupByField({
      client: fakeClient([]),
      entity: 'deal',
      defs: [],
      field: 'Nonexistent',
      value: 'x',
    }).catch((e) => e)
    expect(err.exitCode).toBe(64)
    expect(err.message).toMatch(/unknown field/i)
  })
})
