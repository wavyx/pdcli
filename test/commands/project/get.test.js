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

const { default: ProjectGetCommand } =
  await import('../../../src/commands/project/get.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('project get', () => {
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

  it('gets a project by id', async () => {
    mockApi()
      .get('/api/v2/projects/3')
      .reply(200, {
        success: true,
        data: { id: 3, title: 'Launch' },
      })

    const stdout = await runCmd(ProjectGetCommand, ['3', '--output', 'json'])

    expect(JSON.parse(stdout).title).toBe('Launch')
  })
})
