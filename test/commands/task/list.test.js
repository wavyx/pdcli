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

const { default: TaskListCommand } =
  await import('../../../src/commands/task/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('task list', () => {
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

  it('lists tasks, mapping is_done/assignee_ids to done/assignee columns', async () => {
    mockApi()
      .get('/api/v2/tasks')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            title: 'Write spec',
            project_id: 3,
            assignee_ids: [7],
            due_date: '2026-06-10',
            is_done: false,
          },
        ],
      })

    const stdout = await runCmd(TaskListCommand, ['--output', 'table'])

    expect(stdout).toContain('Write spec')
    expect(stdout).toContain('2026-06-10')
    expect(stdout).toContain('no')
    expect(stdout).toContain('7')
  })

  it('passes project/assignee/parent and is_done=false (todo) as query params', async () => {
    mockApi()
      .get('/api/v2/tasks')
      .query({
        limit: '500',
        project_id: '3',
        assignee_id: '7',
        parent_task_id: '5',
        is_done: 'false',
      })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(TaskListCommand, [
      '--project',
      '3',
      '--assignee',
      '7',
      '--parent',
      '5',
      '--todo',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('passes is_done=true for --done', async () => {
    mockApi()
      .get('/api/v2/tasks')
      .query({ limit: '500', is_done: 'true' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(TaskListCommand, ['--done', '--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('renders done as yes when is_done is true', async () => {
    mockApi()
      .get('/api/v2/tasks')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 2, title: 'Closed', is_done: true, assignee_ids: [] }],
      })

    const stdout = await runCmd(TaskListCommand, ['--output', 'table'])

    expect(stdout).toContain('yes')
  })

  it('renders blanks for unassigned tasks in table mode', async () => {
    mockApi()
      .get('/api/v2/tasks')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            id: 3,
            title: 'Orphan',
            project_id: 1,
            assignee_ids: null,
            done: 0,
          },
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(TaskListCommand, ['--output', 'table'])
    expect(stdout).toContain('Orphan')
  })
})
