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

const { default: ProjectListCommand } =
  await import('../../../src/commands/project/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('project list', () => {
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

  it('lists projects', async () => {
    mockApi()
      .get('/api/v2/projects')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 3,
            title: 'Launch',
            status: 'open',
            owner_id: 1,
            start_date: '2026-01-01',
            end_date: '2026-02-01',
          },
        ],
      })

    const stdout = await runCmd(ProjectListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].title).toBe('Launch')
  })

  it('routes to /api/v2/projects/archived with --archived', async () => {
    mockApi()
      .get('/api/v2/projects/archived')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 9, title: 'Archived project', status: 'completed' }],
      })

    const stdout = await runCmd(ProjectListCommand, [
      '--archived',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].title).toBe('Archived project')
  })
})
