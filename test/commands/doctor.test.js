import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockGetToken = vi.fn()
const mockIsKeychainAvailable = vi.fn()
vi.mock('../../src/lib/keychain.js', () => ({
  getToken: mockGetToken,
  isKeychainAvailable: mockIsKeychainAvailable,
}))

const mockGetProfileConfig = vi.fn()
vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  getConf: vi.fn().mockReturnValue({ path: '/tmp/pdcli-test-config' }),
  getActiveProfile: vi.fn().mockReturnValue('default'),
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
