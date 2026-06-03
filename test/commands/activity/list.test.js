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

const { default: ActivityListCommand } =
  await import('../../../src/commands/activity/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('activity list', () => {
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

  it('lists activities', async () => {
    mockApi()
      .get('/api/v2/activities')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            subject: 'Call Jane',
            type: 'call',
            due_date: '2026-06-04',
            done: false,
            deal_id: 42,
          },
        ],
      })

    const stdout = await runCmd(ActivityListCommand, ['--output', 'table'])

    expect(stdout).toContain('Call Jane')
    expect(stdout).toContain('call')
    expect(stdout).toContain('2026-06-04')
  })

  it('passes done and deal filters as query params', async () => {
    mockApi()
      .get('/api/v2/activities')
      .query({ limit: '100', done: 'false', deal_id: '42' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(ActivityListCommand, [
      '--todo',
      '--deal',
      '42',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })
})
