import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: PersonUpsertCommand } =
  await import('../../../src/commands/person/upsert.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

/** Mock the field-defs fetch (getFields always runs first). */
function mockFields(defs = []) {
  mockApi()
    .get('/api/v2/personFields')
    .reply(200, { success: true, data: defs })
}

/**
 * Mock the scoped search as a candidate-id finder, then a record fetch per
 * candidate (lookup verifies against the full record, not the search item).
 */
function mockSearch(records = []) {
  mockApi()
    .get('/api/v2/persons/search')
    .query(true)
    .reply(200, {
      success: true,
      data: { items: records.map((r) => ({ item: { id: r.id } })) },
      additional_data: { next_cursor: null },
    })
  for (const r of records) {
    mockApi()
      .get(`/api/v2/persons/${r.id}`)
      .reply(200, { success: true, data: r })
  }
}

describe('person upsert', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('creates when no match, injecting the match field (json)', async () => {
    mockFields()
    mockSearch([])
    mockApi()
      .post('/api/v2/persons', {
        emails: [{ value: 'a@x.com', primary: true }],
      })
      .reply(201, { success: true, data: { id: 99, name: 'A' } })

    const stdout = await runCmd(PersonUpsertCommand, [
      'a@x.com',
      '--by',
      'email',
      '--output',
      'json',
    ])
    const out = JSON.parse(stdout)
    expect(out.action).toBe('created')
    expect(out.id).toBe(99)
  })

  it('PATCHes only the changed fields when exactly one matches (json)', async () => {
    mockFields()
    mockSearch([{ id: 7, emails: [{ value: 'a@x.com' }], owner_id: 1 }])
    mockApi()
      .patch('/api/v2/persons/7', { owner_id: 42 })
      .reply(200, { success: true, data: { id: 7, owner_id: 42 } })

    const stdout = await runCmd(PersonUpsertCommand, [
      'a@x.com',
      '--by',
      'email',
      '--body',
      '{"owner_id":42}',
      '--output',
      'json',
    ])
    const out = JSON.parse(stdout)
    expect(out.action).toBe('updated')
    expect(out.id).toBe(7)
    expect(out.changed).toEqual({ owner_id: 42 })
  })

  it('refuses an ambiguous match with exit 65', async () => {
    mockFields()
    mockSearch([
      { id: 7, emails: [{ value: 'a@x.com' }] },
      { id: 8, emails: [{ value: 'a@x.com' }] },
    ])
    const err = await PersonUpsertCommand.run([
      'a@x.com',
      '--by',
      'email',
      '--output',
      'json',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
  })

  it('prints a one-line summary for the created record (table)', async () => {
    mockFields()
    mockSearch([])
    mockApi()
      .post('/api/v2/persons')
      .reply(201, { success: true, data: { id: 99 } })

    const stdout = await runCmd(PersonUpsertCommand, [
      'a@x.com',
      '--by',
      'email',
      '--output',
      'table',
    ])
    expect(stdout).toBe('create person #99')
  })
})
