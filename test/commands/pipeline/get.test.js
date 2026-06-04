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

const { default: PipelineGetCommand } =
  await import('../../../src/commands/pipeline/get.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('pipeline get', () => {
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

  it('gets a pipeline by id', async () => {
    mockApi()
      .get('/api/v2/pipelines/1')
      .reply(200, {
        success: true,
        data: { id: 1, name: 'Sales' },
      })

    const stdout = await runCmd(PipelineGetCommand, ['1', '--output', 'json'])

    expect(JSON.parse(stdout).name).toBe('Sales')
  })
})
