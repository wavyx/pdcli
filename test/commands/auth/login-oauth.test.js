import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockSetToken = vi.fn()
const mockSetOAuthTokens = vi.fn()
vi.mock('../../../src/lib/keychain.js', () => ({
  setToken: mockSetToken,
  setOAuthTokens: mockSetOAuthTokens,
}))

const mockSetProfileConfig = vi.fn()
vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  setProfileConfig: mockSetProfileConfig,
}))

const mockFlow = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, authorizationCodeFlow: mockFlow }
})

const mockInput = vi.fn()
const mockPassword = vi.fn()
vi.mock('@inquirer/prompts', () => ({
  input: mockInput,
  password: mockPassword,
}))

const { default: LoginCommand } =
  await import('../../../src/commands/auth/login.js')
import { runCmd } from '../../helpers.js'

describe('auth login --oauth', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockSetToken.mockReset()
    mockSetOAuthTokens.mockReset()
    mockSetProfileConfig.mockReset()
    mockFlow.mockReset()
    mockInput.mockReset()
    mockPassword.mockReset()
  })

  afterEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_CLIENT_ID
    delete process.env.PDCLI_CLIENT_SECRET
  })

  it('runs the browser flow and stores the OAuth bundle in the keychain', async () => {
    mockFlow.mockResolvedValue({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresIn: 3599,
      apiDomain: 'https://acme.pipedrive.com',
    })
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .matchHeader('authorization', 'Bearer at-1')
      .reply(200, {
        success: true,
        data: { id: 1, name: 'OAuth Jane', email: 'jane@acme.com' },
      })

    const stdout = await runCmd(LoginCommand, [
      '--oauth',
      '--client-id',
      'cid',
      '--client-secret',
      'csec',
    ])

    expect(mockFlow).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'cid', clientSecret: 'csec' }),
    )
    expect(mockSetOAuthTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        apiDomain: 'https://acme.pipedrive.com',
        clientId: 'cid',
        clientSecret: 'csec',
        expiresAt: expect.any(Number),
      }),
    )
    expect(mockSetProfileConfig).toHaveBeenCalledWith(
      'default',
      'auth_mode',
      'oauth',
    )
    expect(mockSetProfileConfig).toHaveBeenCalledWith(
      'default',
      'company_domain',
      'acme',
    )
    expect(mockSetToken).not.toHaveBeenCalled()
    expect(stdout).toContain('OAuth Jane')
  })

  it('reads the client credentials from env vars', async () => {
    process.env.PDCLI_CLIENT_ID = 'env-cid'
    process.env.PDCLI_CLIENT_SECRET = 'env-csec'
    mockFlow.mockResolvedValue({
      accessToken: 'at-2',
      refreshToken: 'rt-2',
      expiresIn: 3599,
      apiDomain: 'https://acme.pipedrive.com',
    })
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .reply(200, { success: true, data: { id: 1, name: 'E', email: 'e@a' } })

    await runCmd(LoginCommand, ['--oauth'])

    expect(mockFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'env-cid',
        clientSecret: 'env-csec',
      }),
    )
  })

  it('prompts for missing client credentials', async () => {
    mockInput.mockResolvedValue('prompt-cid')
    mockPassword.mockResolvedValue('prompt-csec')
    mockFlow.mockResolvedValue({
      accessToken: 'at-3',
      refreshToken: 'rt-3',
      expiresIn: 3599,
      apiDomain: 'https://acme.pipedrive.com',
    })
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .reply(200, { success: true, data: { id: 1, name: 'P', email: 'p@a' } })

    await runCmd(LoginCommand, ['--oauth'])

    expect(mockInput).toHaveBeenCalled()
    expect(mockPassword).toHaveBeenCalled()
    expect(mockFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'prompt-cid',
        clientSecret: 'prompt-csec',
      }),
    )
  })
})
