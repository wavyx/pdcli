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

const { default: ProjectUpdateCommand } =
  await import('../../../src/commands/project/update.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('project update', () => {
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

  it('PATCHes only the provided flags', async () => {
    mockApi()
      .patch('/api/v2/projects/7', { title: 'Renamed' })
      .reply(200, {
        success: true,
        data: { id: 7, title: 'Renamed' },
      })

    const stdout = await runCmd(ProjectUpdateCommand, [
      '7',
      '--title',
      'Renamed',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).title).toBe('Renamed')
  })

  it('PATCHes phase/board/owner/date changes', async () => {
    mockApi()
      .patch('/api/v2/projects/7', {
        description: 'd',
        status: 'closed',
        start_date: '2026-03-01',
        end_date: '2026-04-01',
        owner_id: 9,
        board_id: 2,
        phase_id: 3,
      })
      .reply(200, { success: true, data: { id: 7 } })

    const stdout = await runCmd(ProjectUpdateCommand, [
      '7',
      '--description',
      'd',
      '--status',
      'closed',
      '--start-date',
      '2026-03-01',
      '--end-date',
      '2026-04-01',
      '--owner',
      '9',
      '--board',
      '2',
      '--phase',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(7)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(ProjectUpdateCommand.run(['7'])).rejects.toThrow(
      /nothing to update/i,
    )
  })
})
