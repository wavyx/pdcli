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

const { default: GoalListCommand } =
  await import('../../../src/commands/goal/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('goal list', () => {
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

  it('lists goals nested under data.goals', async () => {
    mockApi()
      .get('/api/v1/goals/find')
      .reply(200, {
        success: true,
        data: {
          goals: [
            {
              id: 'abc',
              title: 'Q1 deals',
              type: { name: 'deals_won' },
              interval: 'monthly',
              owner_id: 1,
            },
          ],
        },
      })

    const stdout = await runCmd(GoalListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].id).toBe('abc')
  })

  it('defaults to an empty list when data.goals is absent', async () => {
    mockApi().get('/api/v1/goals/find').reply(200, { success: true, data: {} })

    const stdout = await runCmd(GoalListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('passes --assignee and --type as dot-key query params', async () => {
    mockApi()
      .get('/api/v1/goals/find')
      .query({ 'assignee.id': '7', 'type.name': 'deals_won' })
      .reply(200, { success: true, data: { goals: [] } })

    const stdout = await runCmd(GoalListCommand, [
      '--assignee',
      '7',
      '--type',
      'deals_won',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('renders goal columns in a table with fallbacks', async () => {
    mockApi()
      .get('/api/v1/goals/find')
      .reply(200, {
        success: true,
        data: {
          goals: [{ id: 'def', owner_id: 2 }],
        },
      })

    const stdout = await runCmd(GoalListCommand, ['--output', 'table'])

    expect(stdout).toContain('def')
  })

  it('renders title, type name and interval when present', async () => {
    mockApi()
      .get('/api/v1/goals/find')
      .reply(200, {
        success: true,
        data: {
          goals: [
            {
              id: 'ghi',
              title: 'Q2 revenue',
              type: { name: 'revenue_forecast' },
              interval: 'quarterly',
              owner_id: 3,
            },
          ],
        },
      })

    const stdout = await runCmd(GoalListCommand, ['--output', 'table'])

    expect(stdout).toContain('Q2 revenue')
    expect(stdout).toContain('revenue_forecast')
    expect(stdout).toContain('quarterly')
  })
})
