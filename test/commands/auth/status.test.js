import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockGetToken = vi.fn()
const mockIsKeychainAvailable = vi.fn()
const mockGetOAuthTokens = vi.fn()
vi.mock('../../../src/lib/keychain.js', () => ({
  getToken: mockGetToken,
  getOAuthTokens: mockGetOAuthTokens,
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
      .get('/api/v1/users/me')
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
      .get('/api/v1/users/me')
      .replyWithError('network down')

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Token:')
  })
})

describe('auth status edge cases', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockGetToken.mockReset()
    mockGetProfileConfig.mockReset()
  })

  it('shows unavailable keychain and unset host', async () => {
    mockIsKeychainAvailable.mockReturnValue(false)
    mockGetProfileConfig.mockReturnValue(undefined)
    mockGetToken.mockResolvedValue('tok')

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('unavailable')
    expect(stdout).toContain('(not set)')
    // no domain → no identity fetch attempted
    expect(stdout).toContain('Token:')
  })

  it('omits identity lines the API does not return', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue('tok-123')
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .reply(200, { success: true, data: { id: 1 } })

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Authenticated User')
    expect(stdout).not.toContain('Name:')
  })
})

describe('auth status in OAuth mode', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockGetToken.mockReset()
    mockGetOAuthTokens.mockReset()
    mockGetProfileConfig.mockReset()
    mockIsKeychainAvailable.mockReturnValue(true)
  })

  it('shows OAuth mode with expiry and identity', async () => {
    mockGetProfileConfig.mockImplementation((p, key) =>
      key === 'auth_mode' ? 'oauth' : 'acme',
    )
    mockGetOAuthTokens.mockResolvedValue({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresAt: Date.now() + 30 * 60_000,
      apiDomain: 'https://acme.pipedrive.com',
      clientId: 'cid',
      clientSecret: 'csec',
    })
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .matchHeader('authorization', 'Bearer at-1')
      .reply(200, {
        success: true,
        data: { id: 1, name: 'OAuth Jane', email: 'jane@acme.com' },
      })

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('OAuth')
    expect(stdout).toMatch(/expires in/i)
    expect(stdout).toContain('jane@acme.com')
  })

  it('reports not authenticated when OAuth mode has no tokens', async () => {
    mockGetProfileConfig.mockImplementation((p, key) =>
      key === 'auth_mode' ? 'oauth' : 'acme',
    )
    mockGetOAuthTokens.mockResolvedValue(null)

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Not authenticated')
  })
})
