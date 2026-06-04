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

const { default: StageGetCommand } =
  await import('../../../src/commands/stage/get.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('stage get', () => {
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

  it('gets a stage by id', async () => {
    mockApi()
      .get('/api/v2/stages/5')
      .reply(200, {
        success: true,
        data: { id: 5, name: 'Qualified', pipeline_id: 1 },
      })

    const stdout = await runCmd(StageGetCommand, ['5', '--output', 'json'])

    expect(JSON.parse(stdout).name).toBe('Qualified')
  })
})
