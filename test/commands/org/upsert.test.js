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

const { default: OrgUpsertCommand } =
  await import('../../../src/commands/org/upsert.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

function mockFields(defs = []) {
  mockApi()
    .get('/api/v2/organizationFields')
    .reply(200, { success: true, data: defs })
}

function mockSearch(records = []) {
  mockApi()
    .get('/api/v2/organizations/search')
    .query(true)
    .reply(200, {
      success: true,
      data: { items: records.map((r) => ({ item: { id: r.id } })) },
      additional_data: { next_cursor: null },
    })
  for (const r of records) {
    mockApi()
      .get(`/api/v2/organizations/${r.id}`)
      .reply(200, { success: true, data: r })
  }
}

describe('org upsert', () => {
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

  it('creates when no org matches, injecting the name (json)', async () => {
    mockFields()
    mockSearch([])
    mockApi()
      .post('/api/v2/organizations', { name: 'Acme' })
      .reply(201, { success: true, data: { id: 5, name: 'Acme' } })

    const stdout = await runCmd(OrgUpsertCommand, [
      'Acme',
      '--by',
      'name',
      '--output',
      'json',
    ])
    const out = JSON.parse(stdout)
    expect(out.action).toBe('created')
    expect(out.id).toBe(5)
  })

  it('reports unchanged when the matched org already matches (table)', async () => {
    mockFields()
    mockSearch([{ id: 7, name: 'Acme', owner_id: 1 }])

    const stdout = await runCmd(OrgUpsertCommand, [
      'Acme',
      '--by',
      'name',
      '--body',
      '{"owner_id":1}',
      '--output',
      'table',
    ])
    expect(stdout).toBe('org #7 unchanged')
  })

  it('previews a create without writing (dry-run table)', async () => {
    mockFields()
    mockSearch([])

    const stdout = await runCmd(OrgUpsertCommand, [
      'Acme',
      '--by',
      'name',
      '--dry-run',
      '--output',
      'table',
    ])
    expect(stdout).toBe('[dry-run] would create org')
  })
})
