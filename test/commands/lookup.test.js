import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})
vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: LookupCommand } = await import('../../src/commands/lookup.js')
import { runCmd, mockApi } from '../helpers.js'
import { clearFieldsCache } from '../../src/lib/fields.js'

const HASH = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b'

/** Mock the dealFields lookup so `po_number` resolves to HASH. */
function mockDealFields() {
  mockApi()
    .get('/api/v2/dealFields')
    .query(true)
    .reply(200, {
      success: true,
      data: [{ field_code: HASH, field_name: 'PO Number' }],
    })
}

describe('lookup', () => {
  beforeEach(() => {
    clearFieldsCache()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'test-token',
    })
  })

  afterEach(() => {
    nock.cleanAll()
    vi.clearAllMocks()
  })

  it('resolves a custom field name to its hash and queries itemSearch/field', async () => {
    mockDealFields()
    const scope = mockApi()
      .get('/api/v2/itemSearch/field')
      .query({
        term: 'PO-1234',
        entity_type: 'deal',
        field: HASH,
        match: 'exact',
      })
      .reply(200, {
        success: true,
        data: [{ result_score: 1, item: { id: 42 } }],
      })

    const stdout = await runCmd(LookupCommand, [
      'deal',
      '--field',
      'PO Number',
      '--value',
      'PO-1234',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(stdout)).toEqual([{ id: 42 }])
  })

  it('maps org to the organization entity_type', async () => {
    mockApi()
      .get('/api/v2/organizationFields')
      .query(true)
      .reply(200, {
        success: true,
        data: [{ field_code: 'name', field_name: 'Name' }],
      })
    const scope = mockApi()
      .get('/api/v2/itemSearch/field')
      .query((q) => q.entity_type === 'organization' && q.field === 'name')
      .reply(200, { success: true, data: [{ item: { id: 7 } }] })

    await runCmd(LookupCommand, [
      'org',
      '--field',
      'Name',
      '--value',
      'Acme',
      '--output',
      'json',
    ])
    expect(scope.isDone()).toBe(true)
  })

  it('--first returns only the first match as a single object', async () => {
    mockDealFields()
    mockApi()
      .get('/api/v2/itemSearch/field')
      .query(true)
      .reply(200, {
        success: true,
        data: [{ item: { id: 42 } }, { item: { id: 43 } }],
      })

    const stdout = await runCmd(LookupCommand, [
      'deal',
      '--field',
      'PO Number',
      '--value',
      'PO-1234',
      '--first',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual({ id: 42 })
  })

  it('exits 3 when there is no match (branch create-vs-update)', async () => {
    mockDealFields()
    mockApi()
      .get('/api/v2/itemSearch/field')
      .query(true)
      .reply(200, { success: true, data: [] })

    const err = await LookupCommand.run([
      'deal',
      '--field',
      'PO Number',
      '--value',
      'nope',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(3)
  })

  it('treats a response with no data array as no match (exit 3)', async () => {
    mockDealFields()
    mockApi()
      .get('/api/v2/itemSearch/field')
      .query(true)
      .reply(200, { success: true })

    const err = await LookupCommand.run([
      'deal',
      '--field',
      'PO Number',
      '--value',
      'nope',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(3)
  })

  it('exits 64 for an unknown field name', async () => {
    mockDealFields()
    const err = await LookupCommand.run([
      'deal',
      '--field',
      'No Such Field',
      '--value',
      'x',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('passes match=beginning through and enforces the 2-char minimum', async () => {
    mockDealFields()
    const err = await LookupCommand.run([
      'deal',
      '--field',
      'PO Number',
      '--value',
      'x',
      '--match',
      'beginning',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('caps --limit at the 100 the field-search endpoint allows', async () => {
    mockDealFields()
    const scope = mockApi()
      .get('/api/v2/itemSearch/field')
      .query((q) => q.limit === '100')
      .reply(200, { success: true, data: [{ item: { id: 42 } }] })

    await runCmd(LookupCommand, [
      'deal',
      '--field',
      'PO Number',
      '--value',
      'PO-1234',
      '--limit',
      '500',
    ])
    expect(scope.isDone()).toBe(true)
  })
})
