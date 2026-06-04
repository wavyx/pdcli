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

const { default: FilterGetCommand } =
  await import('../../../src/commands/filter/get.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('filter get', () => {
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

  it('gets a filter by id', async () => {
    mockApi()
      .get('/api/v1/filters/5')
      .reply(200, {
        success: true,
        data: { id: 5, name: 'My deals', type: 'deals' },
      })

    const stdout = await runCmd(FilterGetCommand, ['5', '--output', 'json'])

    expect(JSON.parse(stdout).id).toBe(5)
  })
})
