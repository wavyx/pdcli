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

const { default: TaskGetCommand } =
  await import('../../../src/commands/task/get.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('task get', () => {
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

  it('gets a task by id', async () => {
    mockApi()
      .get('/api/v2/tasks/9')
      .reply(200, {
        success: true,
        data: { id: 9, title: 'Write spec' },
      })

    const stdout = await runCmd(TaskGetCommand, ['9', '--output', 'json'])

    expect(JSON.parse(stdout).title).toBe('Write spec')
  })
})
