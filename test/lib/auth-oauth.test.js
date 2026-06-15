import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

let capturedAuthUrl
vi.mock('open', () => ({
  default: vi.fn(async (url) => {
    capturedAuthUrl = url
  }),
}))

const mockGetOAuthTokens = vi.fn()
const mockSetOAuthTokens = vi.fn()
vi.mock('../../src/lib/keychain.js', () => ({
  getToken: vi.fn().mockResolvedValue(null),
  getOAuthTokens: mockGetOAuthTokens,
  setOAuthTokens: mockSetOAuthTokens,
}))

const mockGetProfileConfig = vi.fn()
vi.mock('../../src/lib/config.js', () => ({
  getProfileConfig: mockGetProfileConfig,
}))

const {
  exchangeCode,
  refreshAccessToken,
  authorizationCodeFlow,
  getValidOAuthAccess,
  resolveCredentials,
} = await import('../../src/lib/auth.js')

const OAUTH_BASE = 'https://oauth.pipedrive.com'
const BASIC = 'Basic ' + Buffer.from('cid:csec').toString('base64')

const TOKEN_REPLY = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  expires_in: 3599,
  api_domain: 'https://acme.pipedrive.com',
  token_type: 'Bearer',
}

describe('exchangeCode', () => {
  afterEach(() => nock.cleanAll())

  it('POSTs the code with Basic auth and returns tokens + api_domain', async () => {
    const scope = nock(OAUTH_BASE)
      .post('/oauth/token', (body) => {
        const params = new URLSearchParams(body)
        return (
          params.get('grant_type') === 'authorization_code' &&
          params.get('code') === 'the-code' &&
          params.get('redirect_uri') === 'http://127.0.0.1:9999/callback'
        )
      })
      .matchHeader('authorization', BASIC)
      .reply(200, TOKEN_REPLY)

    const result = await exchangeCode({
      code: 'the-code',
      clientId: 'cid',
      clientSecret: 'csec',
      redirectUri: 'http://127.0.0.1:9999/callback',
    })

    expect(result.accessToken).toBe('new-access')
    expect(result.refreshToken).toBe('new-refresh')
    expect(result.expiresIn).toBe(3599)
    expect(result.apiDomain).toBe('https://acme.pipedrive.com')
    expect(scope.isDone()).toBe(true)
  })

  it('throws ApiError on a failed exchange', async () => {
    nock(OAUTH_BASE).post('/oauth/token').reply(400, { error: 'invalid_grant' })

    await expect(
      exchangeCode({
        code: 'bad',
        clientId: 'cid',
        clientSecret: 'csec',
        redirectUri: 'http://127.0.0.1:9999/callback',
      }),
    ).rejects.toThrow(/invalid_grant/)
  })
})

describe('refreshAccessToken', () => {
  afterEach(() => nock.cleanAll())

  it('POSTs the refresh token with Basic auth', async () => {
    const scope = nock(OAUTH_BASE)
      .post('/oauth/token', (body) => {
        const params = new URLSearchParams(body)
        return (
          params.get('grant_type') === 'refresh_token' &&
          params.get('refresh_token') === 'old-refresh'
        )
      })
      .matchHeader('authorization', BASIC)
      .reply(200, TOKEN_REPLY)

    const result = await refreshAccessToken({
      refreshToken: 'old-refresh',
      clientId: 'cid',
      clientSecret: 'csec',
    })

    expect(result.accessToken).toBe('new-access')
    expect(result.refreshToken).toBe('new-refresh')
    expect(scope.isDone()).toBe(true)
  })

  it('maps a 400 invalid_grant refresh to exit 77 with re-auth guidance', async () => {
    // An expired/revoked refresh token is the most common failure; it must be
    // an auth problem (77, "run auth login"), not bad data (65), so an agent
    // keyed to re-auth on 77 recovers.
    nock(OAUTH_BASE).post('/oauth/token').reply(400, { error: 'invalid_grant' })

    const err = await refreshAccessToken({
      refreshToken: 'rt',
      clientId: 'cid',
      clientSecret: 'csec',
    }).catch((e) => e)
    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/invalid_grant/)
    expect(err.message).toMatch(/auth login/i)
  })

  it('rethrows a 5xx refresh failure as-is (service-unavailable 69, not auth 77)', async () => {
    nock(OAUTH_BASE)
      .post('/oauth/token')
      .reply(503, { error: 'temporarily_unavailable' })

    const err = await refreshAccessToken({
      refreshToken: 'rt',
      clientId: 'cid',
      clientSecret: 'csec',
    }).catch((e) => e)
    expect(err.exitCode).toBe(69)
  })

  it('maps a 401 invalid_client refresh to exit 77', async () => {
    nock(OAUTH_BASE)
      .post('/oauth/token')
      .reply(401, { error: 'invalid_client' })

    const err = await refreshAccessToken({
      refreshToken: 'rt',
      clientId: 'cid',
      clientSecret: 'csec',
    }).catch((e) => e)
    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/invalid_client/)
  })
})

describe('authorizationCodeFlow', () => {
  beforeEach(() => {
    capturedAuthUrl = undefined
  })

  afterEach(() => nock.cleanAll())

  async function startFlow(overrides = {}) {
    const flowPromise = authorizationCodeFlow({
      clientId: 'cid',
      clientSecret: 'csec',
      timeout: 5000,
      port: 0,
      ...overrides,
    })
    await vi.waitFor(() => expect(capturedAuthUrl).toBeDefined())
    const authUrl = new URL(capturedAuthUrl)
    const callbackUrl = new URL(authUrl.searchParams.get('redirect_uri'))
    return { flowPromise, authUrl, callbackUrl }
  }

  it('opens the Pipedrive authorize URL and resolves on callback', async () => {
    nock(OAUTH_BASE).post('/oauth/token').reply(200, TOKEN_REPLY)

    const { flowPromise, authUrl, callbackUrl } = await startFlow()

    expect(authUrl.origin + authUrl.pathname).toBe(
      'https://oauth.pipedrive.com/oauth/authorize',
    )
    expect(authUrl.searchParams.get('client_id')).toBe('cid')

    const state = authUrl.searchParams.get('state')
    await fetch(
      `http://127.0.0.1:${callbackUrl.port}/callback?code=c1&state=${state}`,
    )

    const result = await flowPromise
    expect(result.accessToken).toBe('new-access')
    expect(result.apiDomain).toBe('https://acme.pipedrive.com')
  })

  it('returns 404 for non-callback paths and keeps waiting', async () => {
    nock(OAUTH_BASE).post('/oauth/token').reply(200, TOKEN_REPLY)
    const { flowPromise, authUrl, callbackUrl } = await startFlow()

    const res = await fetch(`http://127.0.0.1:${callbackUrl.port}/elsewhere`)
    expect(res.status).toBe(404)

    const state = authUrl.searchParams.get('state')
    await fetch(
      `http://127.0.0.1:${callbackUrl.port}/callback?code=c&state=${state}`,
    )
    await flowPromise
  })

  it('rejects on state mismatch (CSRF guard)', async () => {
    const { flowPromise, callbackUrl } = await startFlow()
    const assertion = expect(flowPromise).rejects.toThrow(/state mismatch/i)

    await fetch(
      `http://127.0.0.1:${callbackUrl.port}/callback?code=c&state=wrong`,
    )
    await assertion
  })

  it('rejects when the callback has no code', async () => {
    const { flowPromise, authUrl, callbackUrl } = await startFlow()
    const assertion = expect(flowPromise).rejects.toThrow(/no authorization/i)

    const state = authUrl.searchParams.get('state')
    await fetch(`http://127.0.0.1:${callbackUrl.port}/callback?state=${state}`)
    await assertion
  })

  it('rejects when the token exchange fails', async () => {
    nock(OAUTH_BASE).post('/oauth/token').reply(400, { error: 'denied' })
    const { flowPromise, authUrl, callbackUrl } = await startFlow()
    const assertion = expect(flowPromise).rejects.toThrow(/denied/)

    const state = authUrl.searchParams.get('state')
    await fetch(
      `http://127.0.0.1:${callbackUrl.port}/callback?code=c&state=${state}`,
    )
    await assertion
  })

  it('rejects after the timeout elapses', async () => {
    const flowPromise = authorizationCodeFlow({
      clientId: 'cid',
      clientSecret: 'csec',
      timeout: 50,
      port: 0,
    })
    await expect(flowPromise).rejects.toThrow(/timed out/i)
  })

  it('rejects when the callback port is already in use', async () => {
    const { createServer } = await import('node:http')
    const blocker = createServer(() => {})
    await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const busyPort = blocker.address().port

    try {
      await expect(
        authorizationCodeFlow({
          clientId: 'cid',
          clientSecret: 'csec',
          timeout: 5000,
          port: busyPort,
        }),
      ).rejects.toThrow(/callback server/i)
    } finally {
      blocker.close()
    }
  })
})

describe('getValidOAuthAccess', () => {
  beforeEach(() => {
    mockGetOAuthTokens.mockReset()
    mockSetOAuthTokens.mockReset()
    nock.cleanAll()
  })

  const freshTokens = {
    accessToken: 'fresh',
    refreshToken: 'rt',
    expiresAt: Date.now() + 3600_000,
    apiDomain: 'https://acme.pipedrive.com',
    clientId: 'cid',
    clientSecret: 'csec',
  }

  it('returns the stored access token while fresh', async () => {
    mockGetOAuthTokens.mockResolvedValue(freshTokens)

    const access = await getValidOAuthAccess('default')

    expect(access.accessToken).toBe('fresh')
    expect(access.apiDomain).toBe('https://acme.pipedrive.com')
    expect(mockSetOAuthTokens).not.toHaveBeenCalled()
  })

  it('refreshes and persists when within the expiry buffer', async () => {
    mockGetOAuthTokens.mockResolvedValue({
      ...freshTokens,
      accessToken: 'stale',
      expiresAt: Date.now() + 10_000, // < 5-min buffer
    })
    nock(OAUTH_BASE).post('/oauth/token').reply(200, TOKEN_REPLY)

    const access = await getValidOAuthAccess('default')

    expect(access.accessToken).toBe('new-access')
    expect(mockSetOAuthTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        clientId: 'cid',
        clientSecret: 'csec',
      }),
    )
  })

  it('returns null when no OAuth tokens are stored', async () => {
    mockGetOAuthTokens.mockResolvedValue(null)
    expect(await getValidOAuthAccess('default')).toBeNull()
  })
})

describe('resolveCredentials in OAuth mode', () => {
  beforeEach(() => {
    mockGetOAuthTokens.mockReset()
    mockGetProfileConfig.mockReset()
  })

  afterEach(() => {
    delete process.env.PDCLI_API_TOKEN
    delete process.env.PDCLI_COMPANY_DOMAIN
  })

  it('returns oauth credentials when the profile auth_mode is oauth', async () => {
    mockGetProfileConfig.mockImplementation((profile, key) =>
      key === 'auth_mode' ? 'oauth' : undefined,
    )
    mockGetOAuthTokens.mockResolvedValue({
      accessToken: 'oauth-access',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
      apiDomain: 'https://acme.pipedrive.com',
      clientId: 'cid',
      clientSecret: 'csec',
    })

    const creds = await resolveCredentials({ profile: 'default' })

    expect(creds.mode).toBe('oauth')
    expect(creds.token).toBe('oauth-access')
    expect(creds.apiDomain).toBe('https://acme.pipedrive.com')
    expect(creds.oauth.refreshToken).toBe('rt')
  })

  it('throws AuthRequiredError when oauth mode has no stored tokens', async () => {
    mockGetProfileConfig.mockImplementation((profile, key) =>
      key === 'auth_mode' ? 'oauth' : undefined,
    )
    mockGetOAuthTokens.mockResolvedValue(null)

    await expect(
      resolveCredentials({ profile: 'default' }),
    ).rejects.toMatchObject({ exitCode: 77 })
  })

  it('lets an explicit env token override oauth mode', async () => {
    process.env.PDCLI_API_TOKEN = 'env-token'
    process.env.PDCLI_COMPANY_DOMAIN = 'acme'
    mockGetProfileConfig.mockImplementation((profile, key) =>
      key === 'auth_mode' ? 'oauth' : undefined,
    )

    const creds = await resolveCredentials({ profile: 'default' })

    expect(creds.mode).toBe('token')
    expect(creds.token).toBe('env-token')
  })
})
