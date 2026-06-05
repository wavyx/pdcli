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

const { default: UserFindCommand } =
  await import('../../../src/commands/user/find.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('user find', () => {
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

  it('finds users by term and prints JSON', async () => {
    mockApi()
      .get('/api/v1/users/find')
      .query({ term: 'jane' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            name: 'Jane Doe',
            email: 'jane@acme.com',
            active_flag: true,
            is_admin: 1,
          },
        ],
      })

    const stdout = await runCmd(UserFindCommand, ['jane', '--output', 'json'])
    const users = JSON.parse(stdout)

    expect(users).toHaveLength(1)
    expect(users[0].name).toBe('Jane Doe')
  })

  it('renders matched users in a table with active yes/no', async () => {
    mockApi()
      .get('/api/v1/users/find')
      .query({ term: 'jane' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            name: 'Jane Doe',
            email: 'jane@acme.com',
            active_flag: true,
            is_admin: 1,
          },
          {
            id: 2,
            name: 'Jane Roe',
            email: 'janer@acme.com',
            active_flag: false,
            is_admin: 0,
          },
        ],
      })

    const stdout = await runCmd(UserFindCommand, ['jane', '--output', 'table'])

    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('jane@acme.com')
    expect(stdout).toContain('yes')
    expect(stdout).toContain('no')
  })

  it('passes --by-email as search_by_email=1', async () => {
    mockApi()
      .get('/api/v1/users/find')
      .query({ term: 'jane@acme.com', search_by_email: '1' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(UserFindCommand, [
      'jane@acme.com',
      '--by-email',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('renders an empty result cleanly', async () => {
    mockApi()
      .get('/api/v1/users/find')
      .query({ term: 'nobody' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(UserFindCommand, [
      'nobody',
      '--output',
      'table',
    ])

    expect(stdout).toContain('No results found.')
  })

  it('applies --limit client-side', async () => {
    mockApi()
      .get('/api/v1/users/find')
      .query({ term: 'a' })
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'A One', email: 'a1@acme.com', active_flag: true },
          { id: 2, name: 'A Two', email: 'a2@acme.com', active_flag: true },
        ],
      })

    const stdout = await runCmd(UserFindCommand, [
      'a',
      '--limit',
      '1',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toHaveLength(1)
  })

  it('handles a response with no data field', async () => {
    mockApi()
      .get('/api/v1/users/find')
      .query({ term: 'jane' })
      .reply(200, { success: true })

    const stdout = await runCmd(UserFindCommand, ['jane', '--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([])
  })
})
