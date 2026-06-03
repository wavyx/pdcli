import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resolveCredentials: mockResolveCredentials,
  }
})

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: UserMeCommand } =
  await import('../../../src/commands/user/me.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('user me', () => {
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

  it('prints the authenticated user as JSON', async () => {
    mockApi()
      .get('/api/v1/users/me')
      .reply(200, {
        success: true,
        data: {
          id: 1,
          name: 'Jane Doe',
          email: 'jane@acme.com',
          is_admin: 1,
          timezone_name: 'Europe/Paris',
        },
      })

    const stdout = await runCmd(UserMeCommand, ['--output', 'json'])
    const user = JSON.parse(stdout)

    expect(user.name).toBe('Jane Doe')
    expect(user.email).toBe('jane@acme.com')
  })

  it('renders a table with id, name, and email columns', async () => {
    mockApi()
      .get('/api/v1/users/me')
      .reply(200, {
        success: true,
        data: {
          id: 7,
          name: 'Table User',
          email: 't@acme.com',
          is_admin: 0,
          timezone_name: 'UTC',
        },
      })

    const stdout = await runCmd(UserMeCommand, ['--output', 'table'])

    expect(stdout).toContain('Table User')
    expect(stdout).toContain('t@acme.com')
    expect(stdout).toContain('ID')
  })
})
