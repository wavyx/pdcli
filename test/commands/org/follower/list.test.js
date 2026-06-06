import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: OrgFollowerListCommand } =
  await import('../../../../src/commands/org/follower/list.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('org follower list', () => {
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

  it('lists followers across cursor pages as JSON', async () => {
    mockApi()
      .get('/api/v2/organizations/42/followers')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          { user_id: 1, add_time: '2024-01-01T00:00:00Z' },
          { user_id: 2, add_time: '2024-01-02T00:00:00Z' },
        ],
        additional_data: { next_cursor: 'abc' },
      })
      .get('/api/v2/organizations/42/followers')
      .query({ limit: '500', cursor: 'abc' })
      .reply(200, {
        success: true,
        data: [{ user_id: 3, add_time: '2024-01-03T00:00:00Z' }],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(OrgFollowerListCommand, [
      '42',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(3)
    expect(rows[2].user_id).toBe(3)
  })

  it('caps results with --limit', async () => {
    mockApi()
      .get('/api/v2/organizations/42/followers')
      .query({ limit: '1' })
      .reply(200, {
        success: true,
        data: [{ user_id: 1, add_time: '2024-01-01T00:00:00Z' }],
        additional_data: { next_cursor: 'more' },
      })

    const stdout = await runCmd(OrgFollowerListCommand, [
      '42',
      '--limit',
      '1',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toHaveLength(1)
  })

  it('renders a table with user id and add time', async () => {
    mockApi()
      .get('/api/v2/organizations/42/followers')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [{ user_id: 99, add_time: '2024-05-01T12:00:00Z' }],
      })

    const stdout = await runCmd(OrgFollowerListCommand, [
      '42',
      '--output',
      'table',
    ])

    expect(stdout).toContain('99')
    expect(stdout).toContain('2024-05-01')
  })

  it('requires the deal id positional', async () => {
    await expect(OrgFollowerListCommand.run([])).rejects.toThrow()
  })
})
