import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockGetToken = vi.fn()
const mockIsKeychainAvailable = vi.fn()
vi.mock('../../../src/lib/keychain.js', () => ({
  getToken: mockGetToken,
  isKeychainAvailable: mockIsKeychainAvailable,
}))

const mockGetProfileConfig = vi.fn()
vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  getProfileConfig: mockGetProfileConfig,
}))

const { default: StatusCommand } =
  await import('../../../src/commands/auth/status.js')
import { runCmd } from '../../helpers.js'

describe('auth status', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockGetToken.mockReset()
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReset()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('shows authenticated status with user identity', async () => {
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue('tok-123')
    nock('https://acme.pipedrive.com')
      .get('/api/v2/users/me')
      .matchHeader('x-api-token', 'tok-123')
      .reply(200, {
        success: true,
        data: { id: 1, name: 'Jane Doe', email: 'jane@acme.com' },
      })

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('default')
    expect(stdout).toContain('acme')
    expect(stdout).toContain('OS keychain')
    expect(stdout).toContain('jane@acme.com')
  })

  it('shows not-authenticated guidance when no token stored', async () => {
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue(null)

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Not authenticated')
    expect(stdout).toContain('pdcli auth login')
  })

  it('still reports status when the identity fetch fails', async () => {
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue('tok-123')
    nock('https://acme.pipedrive.com')
      .get('/api/v2/users/me')
      .replyWithError('network down')

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Token:')
  })
})
