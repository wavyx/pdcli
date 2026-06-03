import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetToken = vi.fn()
vi.mock('../../src/lib/keychain.js', () => ({
  getToken: mockGetToken,
}))

const mockGetProfileConfig = vi.fn()
vi.mock('../../src/lib/config.js', () => ({
  getProfileConfig: mockGetProfileConfig,
}))

const {
  resolveCredentials,
  normalizeCompanyDomain,
  companyDomainToBaseOrigin,
  validateToken,
} = await import('../../src/lib/auth.js')

describe('normalizeCompanyDomain', () => {
  it('returns a bare subdomain unchanged', () => {
    expect(normalizeCompanyDomain('acme')).toBe('acme')
  })

  it('strips a full pipedrive URL down to the subdomain', () => {
    expect(normalizeCompanyDomain('https://acme.pipedrive.com/')).toBe('acme')
    expect(normalizeCompanyDomain('https://acme.pipedrive.com')).toBe('acme')
    expect(normalizeCompanyDomain('acme.pipedrive.com')).toBe('acme')
  })

  it('trims whitespace', () => {
    expect(normalizeCompanyDomain('  acme  ')).toBe('acme')
  })
})

describe('companyDomainToBaseOrigin', () => {
  it('builds the per-company origin', () => {
    expect(companyDomainToBaseOrigin('acme')).toBe('https://acme.pipedrive.com')
  })
})

describe('resolveCredentials', () => {
  beforeEach(() => {
    mockGetToken.mockReset()
    mockGetProfileConfig.mockReset()
  })

  afterEach(() => {
    delete process.env.PDCLI_COMPANY_DOMAIN
    delete process.env.PDCLI_API_TOKEN
  })

  it('prefers flags over env and profile', async () => {
    process.env.PDCLI_COMPANY_DOMAIN = 'env-domain'
    process.env.PDCLI_API_TOKEN = 'env-token'

    const creds = await resolveCredentials({
      flags: { company: 'flag-domain', 'api-token': 'flag-token' },
      profile: 'default',
    })

    expect(creds.companyDomain).toBe('flag-domain')
    expect(creds.token).toBe('flag-token')
    expect(creds.source).toBe('flags')
  })

  it('falls back to env vars when no flags', async () => {
    process.env.PDCLI_COMPANY_DOMAIN = 'env-domain'
    process.env.PDCLI_API_TOKEN = 'env-token'

    const creds = await resolveCredentials({ profile: 'default' })

    expect(creds.companyDomain).toBe('env-domain')
    expect(creds.token).toBe('env-token')
    expect(creds.source).toBe('env')
  })

  it('falls back to profile config + keychain when no flags or env', async () => {
    mockGetProfileConfig.mockReturnValue('stored-domain')
    mockGetToken.mockResolvedValue('stored-token')

    const creds = await resolveCredentials({ profile: 'work' })

    expect(mockGetProfileConfig).toHaveBeenCalledWith('work', 'company_domain')
    expect(mockGetToken).toHaveBeenCalledWith('work')
    expect(creds.companyDomain).toBe('stored-domain')
    expect(creds.token).toBe('stored-token')
    expect(creds.source).toBe('profile')
  })

  it('mixes sources: env domain + keychain token', async () => {
    process.env.PDCLI_COMPANY_DOMAIN = 'env-domain'
    mockGetToken.mockResolvedValue('stored-token')

    const creds = await resolveCredentials({ profile: 'default' })

    expect(creds.companyDomain).toBe('env-domain')
    expect(creds.token).toBe('stored-token')
  })

  it('normalizes a full URL passed as the company flag', async () => {
    const creds = await resolveCredentials({
      flags: {
        company: 'https://acme.pipedrive.com/',
        'api-token': 't',
      },
      profile: 'default',
    })
    expect(creds.companyDomain).toBe('acme')
  })

  it('throws ConfigError (78) when company domain is missing', async () => {
    mockGetProfileConfig.mockReturnValue(undefined)
    mockGetToken.mockResolvedValue('a-token')

    await expect(resolveCredentials({ profile: 'default' })).rejects.toThrow(
      /company domain/i,
    )
    await expect(
      resolveCredentials({ profile: 'default' }),
    ).rejects.toMatchObject({ exitCode: 78 })
  })

  it('throws AuthRequiredError (77) when token is missing', async () => {
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue(null)

    await expect(
      resolveCredentials({ profile: 'default' }),
    ).rejects.toMatchObject({ exitCode: 77 })
  })
})

describe('validateToken', () => {
  // Users API has no v2 equivalent (June 2026) — /api/v2/users/me 404s
  // into the web app's HTML page. Must use v1.
  it('fetches /api/v1/users/me and returns the user data', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: { id: 1, name: 'Jane', email: 'jane@acme.com' },
      }),
    }

    const user = await validateToken(client)

    expect(client.get).toHaveBeenCalledWith('/api/v1/users/me')
    expect(user).toEqual({ id: 1, name: 'Jane', email: 'jane@acme.com' })
  })
})
