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

const { default: FilterListCommand } =
  await import('../../../src/commands/filter/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('filter list', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('lists filters', async () => {
    mockApi()
      .get('/api/v1/filters')
      .reply(200, {
        success: true,
        data: [{ id: 5, name: 'My deals', type: 'deals', active_flag: true }],
      })

    const stdout = await runCmd(FilterListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].name).toBe('My deals')
  })

  it('passes --type as a type query param', async () => {
    mockApi()
      .get('/api/v1/filters')
      .query({ type: 'deals' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(FilterListCommand, [
      '--type',
      'deals',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('renders the filter columns in a table', async () => {
    mockApi()
      .get('/api/v1/filters')
      .reply(200, {
        success: true,
        data: [{ id: 5, name: 'My deals', type: 'deals', active_flag: true }],
      })

    const stdout = await runCmd(FilterListCommand, ['--output', 'table'])

    expect(stdout).toContain('My deals')
    expect(stdout).toContain('deals')
  })
})
