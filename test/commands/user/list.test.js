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

const { default: UserListCommand } =
  await import('../../../src/commands/user/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('user list', () => {
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

  it('lists all users as JSON', async () => {
    mockApi()
      .get('/api/v1/users')
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
            name: 'John Roe',
            email: 'john@acme.com',
            active_flag: false,
            is_admin: 0,
          },
        ],
      })

    const stdout = await runCmd(UserListCommand, ['--output', 'json'])
    const users = JSON.parse(stdout)

    expect(users).toHaveLength(2)
    expect(users[0].name).toBe('Jane Doe')
    expect(users[1].email).toBe('john@acme.com')
  })

  it('renders id, name, email, active (yes/no), and admin columns in a table', async () => {
    mockApi()
      .get('/api/v1/users')
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
            name: 'John Roe',
            email: 'john@acme.com',
            active_flag: false,
            is_admin: 0,
          },
        ],
      })

    const stdout = await runCmd(UserListCommand, ['--output', 'table'])

    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('jane@acme.com')
    expect(stdout).toContain('Active')
    expect(stdout).toContain('yes')
    expect(stdout).toContain('no')
  })

  it('applies --limit client-side', async () => {
    mockApi()
      .get('/api/v1/users')
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'One', email: 'one@acme.com', active_flag: true },
          { id: 2, name: 'Two', email: 'two@acme.com', active_flag: true },
          { id: 3, name: 'Three', email: 'three@acme.com', active_flag: true },
        ],
      })

    const stdout = await runCmd(UserListCommand, [
      '--limit',
      '2',
      '--output',
      'json',
    ])
    const users = JSON.parse(stdout)

    expect(users).toHaveLength(2)
  })

  it('renders an empty result cleanly', async () => {
    mockApi().get('/api/v1/users').reply(200, { success: true, data: [] })

    const stdout = await runCmd(UserListCommand, ['--output', 'table'])

    expect(stdout).toContain('No results found.')
  })

  it('handles a response with no data field', async () => {
    mockApi().get('/api/v1/users').reply(200, { success: true })

    const stdout = await runCmd(UserListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([])
  })
})
