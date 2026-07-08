import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockGetToken = vi.fn()
const mockIsKeychainAvailable = vi.fn()
vi.mock('../../src/lib/keychain.js', () => ({
  getToken: mockGetToken,
  isKeychainAvailable: mockIsKeychainAvailable,
}))

const mockGetProfileConfig = vi.fn()
const mockGetConf = vi.fn()
const mockGetActiveProfile = vi.fn()
vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  getConf: mockGetConf,
  getActiveProfile: mockGetActiveProfile,
  getProfileConfig: mockGetProfileConfig,
}))

const { default: DoctorCommand } = await import('../../src/commands/doctor.js')
import { runCmd } from '../helpers.js'

describe('doctor', () => {
  beforeEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
    mockGetToken.mockReset()
    mockIsKeychainAvailable.mockReset()
    mockGetProfileConfig.mockReset()
    mockGetConf.mockReset()
    mockGetConf.mockReturnValue({ path: '/tmp/pdcli-test-config' })
    mockGetActiveProfile.mockReset()
    mockGetActiveProfile.mockReturnValue('default')
  })

  afterEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
  })

  it('reports all checks passing when everything is configured', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue('a-token')
    nock('https://acme.pipedrive.com').get('/api/v1/users/me').reply(401)

    const stdout = await runCmd(DoctorCommand)

    expect(stdout).toContain('Pipedrive CLI Diagnostics')
    expect(stdout).toContain('All checks passed')
  })

  it('fails the token check with exit 78 and suggests auth login', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue(null)
    nock('https://acme.pipedrive.com').get('/api/v1/users/me').reply(401)

    const err = await runCmd(DoctorCommand).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/1 check\(s\) failed/)
    expect(err.stdout).toContain('pdcli auth login')
  })

  it('fails domain and API checks when no company domain configured', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReturnValue(undefined)
    mockGetToken.mockResolvedValue('a-token')

    const err = await runCmd(DoctorCommand).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/2 check\(s\) failed/)
    expect(err.stdout).toContain('Company domain set')
  })

  it('fails the API check with exit 78 when the host is unreachable', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue('a-token')
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .replyWithError('getaddrinfo ENOTFOUND')

    const err = await runCmd(DoctorCommand).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.stdout).toContain('API reachable')
  })
})

describe('doctor machine output', () => {
  beforeEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
    mockGetToken.mockReset()
    mockIsKeychainAvailable.mockReset()
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReset()
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetConf.mockReset()
    mockGetConf.mockReturnValue({ path: '/tmp/pdcli-test-config' })
    mockGetActiveProfile.mockReset()
    mockGetActiveProfile.mockReturnValue('default')
  })

  afterEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
  })

  it('emits only a JSON array of {check, status, detail?} when piped', async () => {
    process.stdout.isTTY = false
    mockGetToken.mockResolvedValue('a-token')
    nock('https://acme.pipedrive.com').get('/api/v1/users/me').reply(401)

    const stdout = await runCmd(DoctorCommand)

    expect(stdout).not.toContain('Pipedrive CLI Diagnostics')
    const rows = JSON.parse(stdout)
    expect(rows.map((r) => r.check)).toEqual([
      'config-dir',
      'keychain',
      'active-profile',
      'company-domain',
      'token',
      'api-reachable',
    ])
    expect(rows.every((r) => r.status === 'pass')).toBe(true)
    expect(rows.find((r) => r.check === 'config-dir').detail).toBeUndefined()
    expect(rows.find((r) => r.check === 'active-profile').detail).toBe(
      'default',
    )
  })

  it('emits fail rows and exits 78 with --output json', async () => {
    mockGetToken.mockResolvedValue(null)
    nock('https://acme.pipedrive.com').get('/api/v1/users/me').reply(401)

    const err = await runCmd(DoctorCommand, ['--output', 'json']).catch(
      (e) => e,
    )

    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    const rows = JSON.parse(err.stdout)
    expect(rows.find((r) => r.check === 'token')).toEqual({
      check: 'token',
      status: 'fail',
      detail: 'Run: pdcli auth login',
    })
  })

  it('renders yaml with --output yaml', async () => {
    mockGetToken.mockResolvedValue('a-token')
    nock('https://acme.pipedrive.com').get('/api/v1/users/me').reply(401)

    const stdout = await runCmd(DoctorCommand, ['--output', 'yaml'])

    expect(stdout).toContain('check: config-dir')
    expect(stdout).toContain('status: pass')
  })
})

describe('doctor --offline', () => {
  beforeEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
    mockGetToken.mockReset()
    mockIsKeychainAvailable.mockReset()
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReset()
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetConf.mockReset()
    mockGetConf.mockReturnValue({ path: '/tmp/pdcli-test-config' })
    mockGetActiveProfile.mockReset()
    mockGetActiveProfile.mockReturnValue('default')
  })

  afterEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
  })

  it('skips the network probe entirely: no fetch, five checks', async () => {
    mockGetToken.mockResolvedValue('a-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      const stdout = await runCmd(DoctorCommand, [
        '--offline',
        '--output',
        'json',
      ])

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(nock.pendingMocks()).toEqual([])
      const rows = JSON.parse(stdout)
      expect(rows).toHaveLength(5)
      expect(rows.some((r) => r.check === 'api-reachable')).toBe(false)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('passes all five checks in table mode without a domain probe', async () => {
    mockGetToken.mockResolvedValue('a-token')

    const stdout = await runCmd(DoctorCommand, ['--offline'])

    expect(stdout).toContain('All checks passed')
    expect(stdout).not.toContain('API reachable')
  })
})

describe('doctor env-token mode', () => {
  beforeEach(() => {
    nock.cleanAll()
    process.env.PDCLI_API_TOKEN = 'env-token-value'
    mockGetToken.mockReset()
    mockIsKeychainAvailable.mockReset()
    mockGetProfileConfig.mockReset()
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetConf.mockReset()
    mockGetConf.mockReturnValue({ path: '/tmp/pdcli-test-config' })
    mockGetActiveProfile.mockReset()
    mockGetActiveProfile.mockReturnValue('default')
  })

  afterEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
  })

  it('token passes from env and keychain unavailability becomes a pass', async () => {
    mockIsKeychainAvailable.mockReturnValue(false)

    const stdout = await runCmd(DoctorCommand, [
      '--offline',
      '--output',
      'json',
    ])

    const rows = JSON.parse(stdout)
    expect(rows.find((r) => r.check === 'token')).toEqual({
      check: 'token',
      status: 'pass',
      detail: 'source: env',
    })
    expect(rows.find((r) => r.check === 'keychain')).toEqual({
      check: 'keychain',
      status: 'pass',
      detail: 'env-token mode (keychain not required)',
    })
    expect(mockGetToken).not.toHaveBeenCalled()
  })

  it('keeps the plain keychain pass when the keychain is available', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)

    const stdout = await runCmd(DoctorCommand, [
      '--offline',
      '--output',
      'json',
    ])

    const rows = JSON.parse(stdout)
    expect(rows.find((r) => r.check === 'keychain')).toEqual({
      check: 'keychain',
      status: 'pass',
    })
    expect(rows.find((r) => r.check === 'token').detail).toBe('source: env')
  })
})

describe('doctor failure branches', () => {
  beforeEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
    mockGetToken.mockReset()
    mockGetProfileConfig.mockReset()
    mockGetConf.mockReset()
    mockGetActiveProfile.mockReset()
  })

  it('reports config store and profile failures with exit 78', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetConf.mockImplementation(() => {
      throw new Error('cannot create config dir')
    })
    mockGetActiveProfile.mockImplementation(() => {
      throw new Error('no profile store')
    })
    mockGetProfileConfig.mockReturnValue(undefined)
    mockGetToken.mockResolvedValue(null)

    const err = await runCmd(DoctorCommand).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/check\(s\) failed/)
    expect(err.stdout).toContain('Cannot access config store')
    expect(err.stdout).toContain('No active profile')
  })
})

describe('doctor without a keychain', () => {
  it('reports the keychain as unavailable and exits 78', async () => {
    nock.cleanAll()
    delete process.env.PDCLI_API_TOKEN
    mockGetConf.mockReturnValue({ path: '/tmp/x' })
    mockGetActiveProfile.mockReturnValue('default')
    mockIsKeychainAvailable.mockReturnValue(false)
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue('tok')
    nock('https://acme.pipedrive.com').get('/api/v1/users/me').reply(401)

    const err = await runCmd(DoctorCommand).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.stdout).toContain('OS keychain unavailable')
  })
})
