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

const { default: DealListCommand } =
  await import('../../../src/commands/deal/list.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('deal list', () => {
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

  it('lists deals across cursor pages as JSON', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          { id: 1, title: 'First', value: 100, currency: 'EUR' },
          { id: 2, title: 'Second', value: 200, currency: 'EUR' },
        ],
        additional_data: { next_cursor: 'abc' },
      })
      .get('/api/v2/deals')
      .query({ limit: '500', cursor: 'abc' })
      .reply(200, {
        success: true,
        data: [{ id: 3, title: 'Third', value: 300, currency: 'USD' }],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealListCommand, ['--output', 'json'])
    const deals = JSON.parse(stdout)

    expect(deals).toHaveLength(3)
    expect(deals[2].title).toBe('Third')
  })

  it('caps results with --limit', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ limit: '2' })
      .reply(200, {
        success: true,
        data: [
          { id: 1, title: 'A' },
          { id: 2, title: 'B' },
        ],
        additional_data: { next_cursor: 'more' },
      })

    const stdout = await runCmd(DealListCommand, [
      '--limit',
      '2',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toHaveLength(2)
  })

  it('passes status and stage filters as query params', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ limit: '500', status: 'won', stage_id: '3' })
      .reply(200, { success: true, data: [{ id: 9, title: 'Won deal' }] })

    const stdout = await runCmd(DealListCommand, [
      '--status',
      'won',
      '--stage',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].id).toBe(9)
  })

  it('defaults the per-request page size to 500', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ limit: '500' })
      .reply(200, { success: true, data: [{ id: 1, title: 'A' }] })

    const stdout = await runCmd(DealListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].id).toBe(1)
  })

  it('maps power-params to their query params', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({
        limit: '500',
        ids: '1,2,3',
        sort_by: 'update_time',
        sort_direction: 'desc',
        updated_since: '2025-01-01T10:20:00Z',
        updated_until: '2025-02-01T10:20:00Z',
      })
      .reply(200, { success: true, data: [{ id: 1, title: 'A' }] })

    const stdout = await runCmd(DealListCommand, [
      '--ids',
      '1,2,3',
      '--sort-by',
      'update_time',
      '--sort-direction',
      'desc',
      '--updated-since',
      '2025-01-01T10:20:00Z',
      '--updated-until',
      '2025-02-01T10:20:00Z',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].id).toBe(1)
  })

  it('rejects more than 100 ids with exit code 64', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1).join(',')
    await expect(
      runCmd(DealListCommand, ['--ids', ids, '--output', 'json']),
    ).rejects.toMatchObject({ oclif: { exit: 64 } })
  })

  it('renders a table with the deal columns', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            title: 'Custom deal',
            value: 500,
            currency: 'EUR',
            status: 'open',
          },
        ],
      })

    const stdout = await runCmd(DealListCommand, ['--output', 'table'])

    expect(stdout).toContain('Custom deal')
    expect(stdout).toContain('500 EUR')
    expect(stdout).toContain('open')
  })
})

describe('deal list --archived', () => {
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

  it('routes to /api/v2/deals/archived with the same filters', async () => {
    mockApi()
      .get('/api/v2/deals/archived')
      .query({ limit: '500', status: 'won', stage_id: '3' })
      .reply(200, { success: true, data: [{ id: 9, title: 'Archived won' }] })

    const stdout = await runCmd(DealListCommand, [
      '--archived',
      '--status',
      'won',
      '--stage',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].id).toBe(9)
  })

  it('does not hit the active /api/v2/deals endpoint when archived', async () => {
    mockApi()
      .get('/api/v2/deals/archived')
      .query({ limit: '500' })
      .reply(200, { success: true, data: [{ id: 1, title: 'Old' }] })

    const stdout = await runCmd(DealListCommand, [
      '--archived',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].title).toBe('Old')
  })
})

describe('deal list edge cases', () => {
  it('renders an empty value cell when the deal has no value', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 5, title: 'No value deal', status: 'open' }],
      })

    const stdout = await runCmd(DealListCommand, ['--output', 'table'])

    expect(stdout).toContain('No value deal')
  })
})

describe('deal list value without currency', () => {
  it('renders the bare amount', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 6, title: 'Currencyless', value: 500 }],
      })

    const stdout = await runCmd(DealListCommand, ['--output', 'table'])

    expect(stdout).toContain('500')
    expect(stdout).not.toContain('500 EUR')
  })

  it('--resolve-fields resolves custom fields across the list (one defs fetch)', async () => {
    const HASH = 'c'.repeat(40)
    let fieldsFetches = 0
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, () => {
        fieldsFetches++
        return {
          success: true,
          data: [
            {
              id: 9,
              field_code: HASH,
              field_name: 'Tier',
              field_type: 'enum',
              options: [{ id: 7, label: 'Gold' }],
              is_custom_field: true,
            },
          ],
          additional_data: { next_cursor: null },
        }
      })
      .persist()
    mockApi()
      .get('/api/v2/deals')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          { id: 1, title: 'A', custom_fields: { [HASH]: 7 } },
          { id: 2, title: 'B', custom_fields: { [HASH]: 7 } },
          { id: 3, title: 'C' },
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealListCommand, [
      '--resolve-fields',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows[0].custom_fields).toEqual({ Tier: 'Gold' })
    expect(rows[1].custom_fields).toEqual({ Tier: 'Gold' })
    expect(rows[2].custom_fields).toBeUndefined()
    expect(fieldsFetches).toBe(1)
  })

  it('list output without the flag keeps raw hash keys', async () => {
    const HASH = 'c'.repeat(40)
    mockApi()
      .get('/api/v2/deals')
      .query(true)
      .reply(200, {
        success: true,
        data: [{ id: 1, title: 'A', custom_fields: { [HASH]: 7 } }],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealListCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)
    expect(rows[0].custom_fields).toEqual({ [HASH]: 7 })
  })

  it('refuses --ids together with --filter (the API silently drops ids)', async () => {
    const err = await DealListCommand.run([
      '--ids',
      '1,2',
      '--filter',
      '5',
    ]).catch((e) => e)
    expect(String(err.message)).toMatch(/cannot also be provided/)
  })
})
