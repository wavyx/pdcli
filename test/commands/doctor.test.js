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

  it('fails the token check and suggests auth login when token missing', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue(null)
    nock('https://acme.pipedrive.com').get('/api/v1/users/me').reply(401)

    const stdout = await runCmd(DoctorCommand)

    expect(stdout).toContain('pdcli auth login')
    expect(stdout).toMatch(/1 check failed/)
  })

  it('fails domain and API checks when no company domain configured', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReturnValue(undefined)
    mockGetToken.mockResolvedValue('a-token')

    const stdout = await runCmd(DoctorCommand)

    expect(stdout).toMatch(/2 checks failed/)
    expect(stdout).toContain('Company domain set')
  })

  it('fails the API check when the host is unreachable', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue('a-token')
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .replyWithError('getaddrinfo ENOTFOUND')

    const stdout = await runCmd(DoctorCommand)

    expect(stdout).toMatch(/1 check failed/)
    expect(stdout).toContain('API reachable')
  })
})

describe('doctor failure branches', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockGetToken.mockReset()
    mockGetProfileConfig.mockReset()
    mockGetConf.mockReset()
    mockGetActiveProfile.mockReset()
  })

  it('reports config store and profile failures', async () => {
    mockIsKeychainAvailable.mockReturnValue(true)
    mockGetConf.mockImplementation(() => {
      throw new Error('cannot create config dir')
    })
    mockGetActiveProfile.mockImplementation(() => {
      throw new Error('no profile store')
    })
    mockGetProfileConfig.mockReturnValue(undefined)
    mockGetToken.mockResolvedValue(null)

    const stdout = await runCmd(DoctorCommand)

    expect(stdout).toContain('Cannot access config store')
    expect(stdout).toContain('No active profile')
    expect(stdout).toMatch(/checks failed/)
  })
})

describe('doctor without a keychain', () => {
  it('reports the keychain as unavailable', async () => {
    nock.cleanAll()
    mockGetConf.mockReturnValue({ path: '/tmp/x' })
    mockGetActiveProfile.mockReturnValue('default')
    mockIsKeychainAvailable.mockReturnValue(false)
    mockGetProfileConfig.mockReturnValue('acme')
    mockGetToken.mockResolvedValue('tok')
    nock('https://acme.pipedrive.com').get('/api/v1/users/me').reply(401)

    const stdout = await runCmd(DoctorCommand)

    expect(stdout).toContain('OS keychain unavailable')
  })
})
