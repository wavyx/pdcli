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

const { default: TaskCreateCommand } =
  await import('../../../src/commands/task/create.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('task create', () => {
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

  it('POSTs typed flags as a v2 body and prints the created task', async () => {
    mockApi()
      .post('/api/v2/tasks', {
        title: 'Write spec',
        project_id: 3,
        description: 'Draft it',
        assignee_id: 7,
        due_date: '2026-06-10',
        parent_task_id: 5,
      })
      .reply(201, {
        success: true,
        data: { id: 99, title: 'Write spec' },
      })

    const stdout = await runCmd(TaskCreateCommand, [
      '--title',
      'Write spec',
      '--project',
      '3',
      '--description',
      'Draft it',
      '--assignee',
      '7',
      '--due-date',
      '2026-06-10',
      '--parent',
      '5',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(99)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v2/tasks', {
        title: 'Flag wins',
        project_id: 3,
        priority: 5,
      })
      .reply(201, { success: true, data: { id: 101 } })

    const stdout = await runCmd(TaskCreateCommand, [
      '--title',
      'Flag wins',
      '--project',
      '3',
      '--body',
      '{"title":"Body title","priority":5}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(101)
  })

  it('requires --title', async () => {
    await expect(TaskCreateCommand.run(['--project', '3'])).rejects.toThrow()
  })

  it('requires --project', async () => {
    await expect(
      TaskCreateCommand.run(['--title', 'No project']),
    ).rejects.toThrow()
  })
})
