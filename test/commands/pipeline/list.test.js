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

const { default: PipelineListCommand } =
  await import('../../../src/commands/pipeline/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('pipeline list', () => {
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

  it('lists pipelines', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            name: 'Sales',
            is_deal_probability_enabled: true,
            order_nr: 0,
          },
        ],
      })

    const stdout = await runCmd(PipelineListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].name).toBe('Sales')
  })
})
