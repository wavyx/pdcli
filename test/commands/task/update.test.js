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

const { default: TaskUpdateCommand } =
  await import('../../../src/commands/task/update.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('task update', () => {
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
      .patch('/api/v2/tasks/7', { title: 'Renamed' })
      .reply(200, {
        success: true,
        data: { id: 7, title: 'Renamed' },
      })

    const stdout = await runCmd(TaskUpdateCommand, [
      '7',
      '--title',
      'Renamed',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).title).toBe('Renamed')
  })

  it('PATCHes project/assignee/parent/date/description and --done', async () => {
    mockApi()
      .patch('/api/v2/tasks/7', {
        description: 'd',
        project_id: 4,
        assignee_id: 9,
        due_date: '2026-04-01',
        parent_task_id: 2,
        done: 1,
      })
      .reply(200, { success: true, data: { id: 7 } })

    const stdout = await runCmd(TaskUpdateCommand, [
      '7',
      '--description',
      'd',
      '--project',
      '4',
      '--assignee',
      '9',
      '--due-date',
      '2026-04-01',
      '--parent',
      '2',
      '--done',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(7)
  })

  it('PATCHes done:0 for --undone', async () => {
    mockApi()
      .patch('/api/v2/tasks/7', { done: 0 })
      .reply(200, { success: true, data: { id: 7 } })

    const stdout = await runCmd(TaskUpdateCommand, [
      '7',
      '--undone',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(7)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(TaskUpdateCommand.run(['7'])).rejects.toThrow(
      /nothing to update/i,
    )
  })
})
