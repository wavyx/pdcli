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
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          { id: 1, title: 'First', value: 100, currency: 'EUR' },
          { id: 2, title: 'Second', value: 200, currency: 'EUR' },
        ],
        additional_data: { next_cursor: 'abc' },
      })
      .get('/api/v2/deals')
      .query({ limit: '100', cursor: 'abc' })
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
      .query({ limit: '100', status: 'won', stage_id: '3' })
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

  it('renders a table with the deal columns', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ limit: '100' })
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
