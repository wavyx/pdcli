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

const { default: DealContextCommand } =
  await import('../../../src/commands/deal/context.js')
import { runCmd, mockApi } from '../../helpers.js'
import { clearFieldsCache } from '../../../src/lib/fields.js'

const DEAL = {
  id: 42,
  title: 'Acme expansion',
  status: 'open',
  value: 100000,
  currency: 'USD',
  person_id: 10,
  org_id: 20,
  update_time: '2026-06-09T00:00:00Z',
  expected_close_date: '2026-07-01',
  custom_fields: { hash1: 5 },
}

function mockFields() {
  mockApi()
    .get('/api/v2/dealFields')
    .query(true)
    .reply(200, {
      success: true,
      data: [
        {
          field_code: 'hash1',
          field_name: 'Region',
          options: [{ id: 5, label: 'EMEA' }],
        },
      ],
    })
  for (const f of ['personFields', 'organizationFields', 'activityFields']) {
    mockApi()
      .get(`/api/v2/${f}`)
      .query(true)
      .reply(200, { success: true, data: [] })
  }
  mockApi()
    .get('/api/v1/noteFields')
    .query(true)
    .reply(200, { success: true, data: [] })
}

function mockFullBundle() {
  mockApi().get('/api/v2/deals/42').reply(200, { success: true, data: DEAL })
  mockApi()
    .get('/api/v2/persons/10')
    .reply(200, { success: true, data: { id: 10, name: 'Jane Doe' } })
  mockApi()
    .get('/api/v2/organizations/20')
    .reply(200, { success: true, data: { id: 20, name: 'Acme Inc' } })
  mockApi()
    .get('/api/v2/activities')
    .query((q) => q.deal_id === '42')
    .reply(200, {
      success: true,
      data: [{ id: 1, subject: 'Call', done: false }],
    })
  mockApi()
    .get('/api/v1/notes')
    .query((q) => q.deal_id === '42')
    .reply(200, { success: true, data: [{ id: 1, content: 'note' }] })
  mockApi()
    .get('/api/v2/deals/42/products')
    .query(true)
    .reply(200, { success: true, data: [{ id: 1, product_id: 5 }] })
  mockApi()
    .get('/api/v1/deals/42/participants')
    .query(true)
    .reply(200, { success: true, data: [] })
  mockFields()
}

describe('deal context', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })
  afterEach(() => nock.cleanAll())

  it('assembles the full bundle with hydrated contacts and resolved fields (JSON)', async () => {
    mockFullBundle()
    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'json'])
    const b = JSON.parse(stdout)
    expect(b.deal.id).toBe(42)
    // custom field hash resolved to name + option label
    expect(b.deal.custom_fields).toEqual({ Region: 'EMEA' })
    expect(b.person.name).toBe('Jane Doe')
    expect(b.org.name).toBe('Acme Inc')
    expect(b.activities).toHaveLength(1)
    expect(b.notes).toHaveLength(1)
    expect(b.products).toHaveLength(1)
    expect(b.flags).toMatchObject({
      missingContact: false,
      noOpenActivities: false,
      activityCount: 1,
      noteCount: 1,
      productCount: 1,
    })
  })

  it('renders a compact summary in table mode', async () => {
    mockFullBundle()
    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'table'])
    expect(stdout).toContain('Acme expansion')
    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('Acme Inc')
  })

  it('skips slices with --no-* flags (no fetch, empty in the bundle)', async () => {
    mockApi().get('/api/v2/deals/42').reply(200, { success: true, data: DEAL })
    mockApi()
      .get('/api/v2/persons/10')
      .reply(200, { success: true, data: { id: 10, name: 'Jane Doe' } })
    mockApi()
      .get('/api/v2/organizations/20')
      .reply(200, { success: true, data: { id: 20, name: 'Acme Inc' } })
    // dealFields/personFields/organizationFields still fetched for resolution
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            field_code: 'hash1',
            field_name: 'Region',
            options: [{ id: 5, label: 'EMEA' }],
          },
        ],
      })
    for (const f of ['personFields', 'organizationFields']) {
      mockApi()
        .get(`/api/v2/${f}`)
        .query(true)
        .reply(200, { success: true, data: [] })
    }
    // No activities/notes/products/participants interceptors: if the command
    // tried to fetch them, nock would throw.
    const stdout = await runCmd(DealContextCommand, [
      '42',
      '--no-activities',
      '--no-notes',
      '--no-products',
      '--no-participants',
      '--output',
      'json',
    ])
    const b = JSON.parse(stdout)
    expect(b.activities).toEqual([])
    expect(b.notes).toEqual([])
    expect(b.flags.activityCount).toBe(0)
  })

  it('renders a sparse deal (no value/contact) and lists risk flags in the table', async () => {
    mockApi()
      .get('/api/v2/deals/42')
      .reply(200, {
        success: true,
        // No title and no status either — exercises those table fallbacks.
        data: {
          id: 42,
          value: null,
          currency: null,
          person_id: null,
          org_id: null,
          update_time: '2026-01-01T00:00:00Z',
          expected_close_date: null,
          custom_fields: {},
        },
      })
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/activities')
      .query((q) => q.deal_id === '42')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v1/notes')
      .query((q) => q.deal_id === '42')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals/42/products')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query(true)
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'table'])
    expect(stdout).toContain('Deal 42')
    expect(stdout).toContain('Person: — · Org: —')
    expect(stdout).toMatch(/Flags:.*missingContact/)
  })

  it('handles a deal with no person or org (missingContact flag)', async () => {
    mockApi()
      .get('/api/v2/deals/42')
      .reply(200, {
        success: true,
        data: { ...DEAL, person_id: null, org_id: null, custom_fields: {} },
      })
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/activities')
      .query((q) => q.deal_id === '42')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v1/notes')
      .query((q) => q.deal_id === '42')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals/42/products')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query(true)
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'json'])
    const b = JSON.parse(stdout)
    expect(b.person).toBeNull()
    expect(b.org).toBeNull()
    expect(b.flags.missingContact).toBe(true)
  })
})
