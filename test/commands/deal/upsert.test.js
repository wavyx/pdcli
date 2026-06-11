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

const { default: DealUpsertCommand } =
  await import('../../../src/commands/deal/upsert.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

function mockFields(defs = []) {
  mockApi().get('/api/v2/dealFields').reply(200, { success: true, data: defs })
}

function mockSearch(records = []) {
  mockApi()
    .get('/api/v2/deals/search')
    .query(true)
    .reply(200, {
      success: true,
      data: { items: records.map((r) => ({ item: { id: r.id } })) },
      additional_data: { next_cursor: null },
    })
  for (const r of records) {
    mockApi()
      .get(`/api/v2/deals/${r.id}`)
      .reply(200, { success: true, data: r })
  }
}

describe('deal upsert', () => {
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

  it('creates when no deal matches, injecting the title (json)', async () => {
    mockFields()
    mockSearch([])
    mockApi()
      .post('/api/v2/deals', { title: 'Acme expansion' })
      .reply(201, { success: true, data: { id: 3, title: 'Acme expansion' } })

    const stdout = await runCmd(DealUpsertCommand, [
      'Acme expansion',
      '--by',
      'title',
      '--output',
      'json',
    ])
    const out = JSON.parse(stdout)
    expect(out.action).toBe('created')
    expect(out.id).toBe(3)
  })

  it('PATCHes one field and prints a singular summary (table)', async () => {
    mockFields()
    mockSearch([{ id: 7, title: 'Acme expansion', value: 100 }])
    mockApi()
      .patch('/api/v2/deals/7', { value: 200 })
      .reply(200, { success: true, data: { id: 7, value: 200 } })

    const stdout = await runCmd(DealUpsertCommand, [
      'Acme expansion',
      '--by',
      'title',
      '--body',
      '{"value":200}',
      '--output',
      'table',
    ])
    expect(stdout).toBe('update deal #7 (1 field)')
  })

  it('previews an update without writing, pluralizing the count (dry-run table)', async () => {
    mockFields()
    mockSearch([{ id: 3, title: 'Acme', value: 1, owner_id: 1 }])

    const stdout = await runCmd(DealUpsertCommand, [
      'Acme',
      '--by',
      'title',
      '--body',
      '{"value":2,"owner_id":9}',
      '--dry-run',
      '--output',
      'table',
    ])
    expect(stdout).toBe('[dry-run] would update deal #3 (2 fields)')
  })
})
