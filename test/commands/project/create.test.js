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

const { default: ProjectCreateCommand } =
  await import('../../../src/commands/project/create.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('project create', () => {
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

  it('POSTs typed flags as a v2 body and prints the created project', async () => {
    mockApi()
      .post('/api/v2/projects', {
        title: 'New Project',
        description: 'Desc',
        status: 'open',
        start_date: '2026-01-01',
        end_date: '2026-02-01',
        owner_id: 3,
        board_id: 4,
        phase_id: 5,
      })
      .reply(201, {
        success: true,
        data: { id: 99, title: 'New Project' },
      })

    const stdout = await runCmd(ProjectCreateCommand, [
      '--title',
      'New Project',
      '--description',
      'Desc',
      '--status',
      'open',
      '--start-date',
      '2026-01-01',
      '--end-date',
      '2026-02-01',
      '--owner',
      '3',
      '--board',
      '4',
      '--phase',
      '5',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(99)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v2/projects', {
        title: 'Flag wins',
        deal_ids: [1, 2],
      })
      .reply(201, { success: true, data: { id: 101 } })

    const stdout = await runCmd(ProjectCreateCommand, [
      '--title',
      'Flag wins',
      '--body',
      '{"title":"Body title","deal_ids":[1,2]}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(101)
  })

  it('requires --title', async () => {
    await expect(ProjectCreateCommand.run([])).rejects.toThrow()
  })
})
