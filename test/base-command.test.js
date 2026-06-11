import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
const mockRefreshAccessToken = vi.fn()
vi.mock('../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resolveCredentials: mockResolveCredentials,
    refreshAccessToken: mockRefreshAccessToken,
  }
})

const mockSetOAuthTokens = vi.fn()
vi.mock('../src/lib/keychain.js', () => ({
  getToken: vi.fn().mockResolvedValue(null),
  getOAuthTokens: vi.fn().mockResolvedValue(null),
  setOAuthTokens: mockSetOAuthTokens,
}))

const mockLoadConfig = vi.fn()
vi.mock('../src/lib/config.js', () => ({
  loadConfig: mockLoadConfig,
  getProfileConfig: vi.fn().mockReturnValue(undefined),
}))

const { default: BaseCommand } = await import('../src/base-command.js')
const { AuthRequiredError } = await import('../src/lib/errors.js')

const API_BASE = 'https://acme.pipedrive.com'

/** Minimal authenticated command used to exercise BaseCommand wiring. */
class ApiCmd extends BaseCommand {
  async run() {
    const body = await this.apiClient.get('/api/v2/users/me')
    await this.outputResults(body.data, {
      id: { header: 'ID' },
      name: { header: 'Name' },
      email: { header: 'Email' },
    })
  }
}

/** Minimal unauthenticated command. */
class NoAuthCmd extends BaseCommand {
  static skipAuth = true
  async run() {
    this.log(`profile:${this.activeProfile} limit:${this.flags.limit ?? ''}`)
  }
}

function captureLogs(CmdClass, argv = []) {
  const lines = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    lines.push(args.map(String).join(' '))
  })
  return CmdClass.run(argv)
    .then(() => lines.join('\n'))
    .finally(() => spy.mockRestore())
}

describe('BaseCommand', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    mockResolveCredentials.mockReset()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'test-token',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
    delete process.env.FORCE_COLOR
    delete process.env.NO_COLOR
    delete process.env.DEBUG
  })

  it('sets DEBUG=pd:* when --verbose flag is passed', async () => {
    await captureLogs(NoAuthCmd, ['--verbose'])
    expect(process.env.DEBUG).toContain('pd:')
  })

  it('appends pd:* to existing DEBUG when --verbose flag is passed', async () => {
    process.env.DEBUG = 'other:*'
    await captureLogs(NoAuthCmd, ['--verbose'])
    expect(process.env.DEBUG).toContain('other:*')
    expect(process.env.DEBUG).toContain('pd:*')
  })

  it('sets FORCE_COLOR=0 when --no-color flag is passed', async () => {
    await captureLogs(NoAuthCmd, ['--no-color'])
    expect(process.env.FORCE_COLOR).toBe('0')
  })

  it('sets FORCE_COLOR=0 when NO_COLOR env is set', async () => {
    process.env.NO_COLOR = '1'
    await captureLogs(NoAuthCmd)
    expect(process.env.FORCE_COLOR).toBe('0')
  })

  it('skips credential resolution when skipAuth is true', async () => {
    const stdout = await captureLogs(NoAuthCmd)
    expect(mockResolveCredentials).not.toHaveBeenCalled()
    expect(stdout).toContain('profile:default')
  })

  it('exposes the parsed --limit flag', async () => {
    const stdout = await captureLogs(NoAuthCmd, ['--limit', '25'])
    expect(stdout).toContain('limit:25')
  })

  it('propagates AuthRequiredError when credentials are missing', async () => {
    mockResolveCredentials.mockRejectedValue(new AuthRequiredError())
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true // interactive → human error carries the message
    try {
      await expect(captureLogs(ApiCmd)).rejects.toThrow('Not authenticated')
    } finally {
      process.stdout.isTTY = origIsTTY
    }
  })

  it('defaults to json output when not TTY', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(200, { success: true, data: { id: 1, name: 'Json User' } })

    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = false
    const stdout = await captureLogs(ApiCmd)
    process.stdout.isTTY = origIsTTY

    expect(stdout).toContain('"name": "Json User"')
  })

  it('defaults to table output when TTY', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(200, { success: true, data: { id: 1, name: 'TTY User' } })

    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true
    const stdout = await captureLogs(ApiCmd)
    process.stdout.isTTY = origIsTTY

    expect(stdout).toContain('TTY User')
    expect(stdout).toContain('│')
  })

  it('respects an explicit --output json', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(200, { success: true, data: { id: 1, name: 'Explicit' } })

    const stdout = await captureLogs(ApiCmd, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual({ id: 1, name: 'Explicit' })
  })

  it('catch surfaces Pipedrive API errors via handleError', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(422, { success: false, error: 'Validation failed' })

    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true // interactive → human error carries the message
    try {
      await expect(captureLogs(ApiCmd)).rejects.toThrow(
        'Pipedrive API 422: Validation failed',
      )
    } finally {
      process.stdout.isTTY = origIsTTY
    }
  })

  it('sends a pdcli User-Agent on API requests', async () => {
    nock.disableNetConnect()
    try {
      const scope = nock(API_BASE)
        .get('/api/v2/users/me')
        .matchHeader('user-agent', /^pdcli\/\d+\.\d+\.\d+/)
        .reply(200, { success: true, data: { id: 1, name: 'UA User' } })

      const stdout = await captureLogs(ApiCmd, ['--output', 'json'])
      expect(stdout).toContain('UA User')
      expect(scope.isDone()).toBe(true)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('passes --no-retry through to the client (429 throws immediately)', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(429, '', { 'x-ratelimit-reset': '9' })

    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true // interactive → human error carries the message
    try {
      await expect(captureLogs(ApiCmd, ['--no-retry'])).rejects.toThrow(
        /Rate limited/,
      )
    } finally {
      process.stdout.isTTY = origIsTTY
    }
  })

  it('defines a --resolve-fields global flag for non-table formats', () => {
    const flag = BaseCommand.baseFlags['resolve-fields']
    expect(flag).toBeDefined()
    expect(flag.type).toBe('boolean')
    expect(flag.helpGroup).toBe('GLOBAL')
    expect(flag.default).toBe(false)
    expect(flag.description).toMatch(/json/i)
    expect(flag.description).toMatch(/yaml/i)
    expect(flag.description).toMatch(/csv/i)
    expect(flag.description).toMatch(/get/i)
  })

  it('parses --resolve-fields onto cmd.flags (default false)', async () => {
    class FlagCmd extends BaseCommand {
      static skipAuth = true
      async run() {
        this.log(`resolve:${this.flags['resolve-fields']}`)
      }
    }
    const off = await captureLogs(FlagCmd, [])
    expect(off).toContain('resolve:false')
    const on = await captureLogs(FlagCmd, ['--resolve-fields'])
    expect(on).toContain('resolve:true')
  })
})

describe('BaseCommand OAuth mode', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    mockRefreshAccessToken.mockReset()
    mockSetOAuthTokens.mockReset()
    mockResolveCredentials.mockResolvedValue({
      mode: 'oauth',
      apiDomain: 'https://acme.pipedrive.com',
      token: 'oauth-access',
      source: 'profile',
      oauth: {
        accessToken: 'oauth-access',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 3600_000,
        apiDomain: 'https://acme.pipedrive.com',
        clientId: 'cid',
        clientSecret: 'csec',
      },
    })
  })

  it('builds a Bearer client from the api_domain', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .matchHeader('authorization', 'Bearer oauth-access')
      .reply(200, { success: true, data: { id: 1, name: 'OAuth User' } })

    const stdout = await captureLogs(ApiCmd, ['--output', 'json'])
    expect(stdout).toContain('OAuth User')
  })

  it('refreshes on 401, persists, and retries', async () => {
    mockRefreshAccessToken.mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'rt-2',
      expiresIn: 3599,
      apiDomain: 'https://acme.pipedrive.com',
    })

    nock(API_BASE)
      .get('/api/v2/users/me')
      .matchHeader('authorization', 'Bearer oauth-access')
      .reply(401, { success: false, error: 'expired' })
      .get('/api/v2/users/me')
      .matchHeader('authorization', 'Bearer fresh-access')
      .reply(200, { success: true, data: { id: 1, name: 'Refreshed' } })

    const stdout = await captureLogs(ApiCmd, ['--output', 'json'])

    expect(stdout).toContain('Refreshed')
    expect(mockRefreshAccessToken).toHaveBeenCalledWith({
      refreshToken: 'rt-1',
      clientId: 'cid',
      clientSecret: 'csec',
    })
    expect(mockSetOAuthTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        accessToken: 'fresh-access',
        refreshToken: 'rt-2',
      }),
    )
  })
})

describe('BaseCommand output formats and filters', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'test-token',
      source: 'profile',
    })
  })

  it('--output yaml renders YAML', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(200, { success: true, data: { id: 1, name: 'Yaml User' } })

    const stdout = await captureLogs(ApiCmd, ['--output', 'yaml'])
    expect(stdout).toContain('name: Yaml User')
  })

  it('--output csv renders CSV with column headers', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(200, {
        success: true,
        data: { id: 1, name: 'Csv User', email: 'c@a.com' },
      })

    const stdout = await captureLogs(ApiCmd, ['--output', 'csv'])
    expect(stdout).toContain('ID,Name,Email')
    expect(stdout).toContain('1,Csv User,c@a.com')
  })

  it('--jq filters single records UNWRAPPED (no .[0] needed)', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(200, { success: true, data: { id: 1, name: 'Jq User' } })

    const stdout = await captureLogs(ApiCmd, ['--jq', '.name'])
    expect(stdout).toContain('Jq User')
    expect(stdout).not.toContain('"id"')
  })

  it('--fields limits table columns', async () => {
    nock(API_BASE)
      .get('/api/v2/users/me')
      .reply(200, {
        success: true,
        data: { id: 1, name: 'Field User', email: 'f@a.com' },
      })

    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true
    const stdout = await captureLogs(ApiCmd, ['--fields', 'id,email'])
    process.stdout.isTTY = origIsTTY

    expect(stdout).toContain('f@a.com')
    expect(stdout).not.toContain('Field User')
  })
})

describe('--jq with array data', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'test-token',
      source: 'profile',
    })
  })

  it('passes arrays to jq unwrapped', async () => {
    class ArrayCmd extends BaseCommand {
      async run() {
        await this.outputResults(
          [
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
          ],
          { id: { header: 'ID' }, name: { header: 'Name' } },
        )
      }
    }

    nock(API_BASE) // no API call needed, but auth wiring runs
    const stdout = await captureLogs(ArrayCmd, ['--jq', '.[1].name'])
    expect(stdout).toContain('B')
  })
})

describe('resolveFormat with default_output', () => {
  class FormatCmd extends BaseCommand {
    static skipAuth = true
    async run() {
      this.log(`format:${this.resolveFormat()}`)
    }
  }

  beforeEach(() => {
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
  })

  it('honors the profile default_output when no --output flag is given', async () => {
    mockLoadConfig.mockReturnValue({
      activeProfile: 'default',
      default_output: 'yaml',
    })
    const stdout = await captureLogs(FormatCmd, [])
    expect(stdout).toContain('format:yaml')
  })

  it('lets an explicit --output flag override default_output', async () => {
    mockLoadConfig.mockReturnValue({
      activeProfile: 'default',
      default_output: 'yaml',
    })
    const stdout = await captureLogs(FormatCmd, ['--output', 'csv'])
    expect(stdout).toContain('format:csv')
  })

  it('ignores an invalid stored default_output and falls back', async () => {
    mockLoadConfig.mockReturnValue({
      activeProfile: 'default',
      default_output: 'bogus',
    })
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = false // piped → the fallback is json
    try {
      const stdout = await captureLogs(FormatCmd, [])
      expect(stdout).toContain('format:json')
    } finally {
      process.stdout.isTTY = origIsTTY
    }
  })

  it('emits JSON errors when default_output is json (no --output flag)', async () => {
    mockLoadConfig.mockReturnValue({
      activeProfile: 'default',
      default_output: 'json',
    })
    class FailCmd extends BaseCommand {
      static skipAuth = true
      async run() {
        throw new AuthRequiredError()
      }
    }
    const writes = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        writes.push(String(chunk))
        return true
      })
    await expect(FailCmd.run([])).rejects.toThrow()
    spy.mockRestore()
    const payload = JSON.parse(writes.join(''))
    expect(payload.error).toBe('AuthRequiredError')
    expect(payload.exitCode).toBe(77)
  })

  it('surfaces parse errors for unknown flags (flags not yet populated)', async () => {
    class ParseCmd extends BaseCommand {
      static skipAuth = true
      async run() {}
    }
    // Before the fix this died with "Cannot read properties of undefined
    // (reading 'profile')" because handleError consulted
    // storedDefaultOutput() while this.flags was still undefined.
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true // interactive → human error carries the message
    try {
      await expect(ParseCmd.run(['--no-such-flag'])).rejects.toThrow(
        /Nonexistent flag/,
      )
    } finally {
      process.stdout.isTTY = origIsTTY
    }
  })

  it('maps oclif parse errors to exit 64 (usage), not 70 (internal)', async () => {
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    class ParseCmd extends BaseCommand {
      static skipAuth = true
      async run() {}
    }
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true // human path
    const err = await ParseCmd.run(['--no-such-flag']).catch((e) => e)
    process.stdout.isTTY = origIsTTY
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('emits a JSON parse error (exit 64) when piped', async () => {
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    class ParseCmd extends BaseCommand {
      static skipAuth = true
      async run() {}
    }
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = false // piped
    const writes = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      writes.push(String(c))
      return true
    })
    await ParseCmd.run(['--no-such-flag']).catch(() => {})
    spy.mockRestore()
    process.stdout.isTTY = origIsTTY
    const payload = JSON.parse(writes.join(''))
    expect(payload.exitCode).toBe(64)
    expect(payload.message).toMatch(/nonexistent flag/i)
  })

  it('emits JSON errors when piped, even with no flag or stored default', async () => {
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    class FailCmd extends BaseCommand {
      static skipAuth = true
      async run() {
        throw new AuthRequiredError()
      }
    }
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = false // piped → machine consumer
    const writes = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      writes.push(String(c))
      return true
    })
    await expect(FailCmd.run([])).rejects.toThrow()
    spy.mockRestore()
    process.stdout.isTTY = origIsTTY
    const payload = JSON.parse(writes.join(''))
    expect(payload.error).toBe('AuthRequiredError')
    expect(payload.exitCode).toBe(77)
  })

  it('keeps human (non-JSON) errors in a TTY with no flag or stored default', async () => {
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    class FailCmd extends BaseCommand {
      static skipAuth = true
      async run() {
        throw new AuthRequiredError()
      }
    }
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true // interactive terminal
    const writes = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      writes.push(String(c))
      return true
    })
    await expect(FailCmd.run([])).rejects.toThrow(/auth login/i)
    spy.mockRestore()
    process.stdout.isTTY = origIsTTY
    expect(() => JSON.parse(writes.join(''))).toThrow()
  })

  it('keeps a genuine internal error at exit 70', async () => {
    mockLoadConfig.mockReturnValue({ activeProfile: 'default' })
    class BoomCmd extends BaseCommand {
      static skipAuth = true
      async run() {
        throw new Error('unexpected boom')
      }
    }
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true
    const err = await BoomCmd.run([]).catch((e) => e)
    process.stdout.isTTY = origIsTTY
    expect(err.exitCode ?? err.oclif?.exit).toBe(70)
  })
})
