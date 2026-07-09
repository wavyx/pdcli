import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: QuotaCommand } = await import('../../src/commands/quota.js')
import { runCmd, mockApi } from '../helpers.js'

/** The probe endpoint + the daily-budget headers it comes back with. */
function mockProbe(headers) {
  return mockApi()
    .get('/api/v1/users/me')
    .reply(200, { success: true, data: { id: 1 } }, headers)
}

describe('quota', () => {
  beforeEach(() => {
    nock.cleanAll()
    delete process.env.PDCLI_BASE_URL
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('prints the daily budget as a table', async () => {
    mockProbe({
      'x-daily-ratelimit-token-remaining': '75000',
      'x-daily-ratelimit-token-limit': '150000',
      'x-ratelimit-reset': '2',
    })

    const stdout = await runCmd(QuotaCommand, ['--output', 'table'])

    expect(stdout).toContain('75000')
    expect(stdout).toContain('150000')
    expect(stdout).toContain('50%')
  })

  it('emits the nested { daily, reset } shape as JSON', async () => {
    mockProbe({
      'x-daily-ratelimit-token-remaining': '120000',
      'x-daily-ratelimit-token-limit': '150000',
      'x-ratelimit-reset': '2',
    })

    const stdout = await runCmd(QuotaCommand, ['--output', 'json'])
    const out = JSON.parse(stdout)

    expect(out).toEqual({
      daily: { remaining: 120000, limit: 150000, pct: 80 },
      reset: 2,
    })
  })

  it('prints n/a and exits 0 when the daily headers are absent', async () => {
    mockProbe({})

    const stdout = await runCmd(QuotaCommand, ['--output', 'json'])
    const out = JSON.parse(stdout)

    expect(out).toEqual({
      daily: { remaining: null, limit: null, pct: null },
      reset: null,
    })
  })

  it('fails with exit 75 when remaining is below --min', async () => {
    mockProbe({
      'x-daily-ratelimit-token-remaining': '900',
      'x-daily-ratelimit-token-limit': '150000',
    })

    const err = await runCmd(QuotaCommand, ['--min', '1000']).catch((e) => e)

    expect(err.oclif.exit).toBe(75)
    expect(err.message).toMatch(/min/i)
  })

  it('passes when remaining is at or above --min', async () => {
    mockProbe({
      'x-daily-ratelimit-token-remaining': '2000',
      'x-daily-ratelimit-token-limit': '150000',
    })

    const stdout = await runCmd(QuotaCommand, ['--min', '1000'])
    expect(stdout).toContain('2000')
  })

  it('fails with exit 75 when the remaining pct is below --threshold', async () => {
    mockProbe({
      'x-daily-ratelimit-token-remaining': '15000',
      'x-daily-ratelimit-token-limit': '150000',
    })

    const err = await runCmd(QuotaCommand, ['--threshold', '25']).catch(
      (e) => e,
    )

    expect(err.oclif.exit).toBe(75)
    expect(err.message).toMatch(/threshold/i)
  })

  it('does not gate when the daily headers are absent (exit 0)', async () => {
    mockProbe({})

    const stdout = await runCmd(QuotaCommand, ['--min', '1000'])
    expect(stdout).toContain('n/a')
  })

  it('passes when the remaining pct is at or above --threshold', async () => {
    mockProbe({
      'x-daily-ratelimit-token-remaining': '120000',
      'x-daily-ratelimit-token-limit': '150000',
    })

    // pct = 80, which is >= 50 → no gate trips.
    const stdout = await runCmd(QuotaCommand, ['--threshold', '50'])
    expect(stdout).toContain('120000')
  })

  it('errors (not exit 0) when --threshold is set but the limit header is absent', async () => {
    // remaining is known but no daily-limit header → pct can't be computed.
    // The gate must FAIL CLOSED: silently passing would be a false green for a
    // CI job gating on `pdcli quota --threshold N`. It still prints the reading.
    mockProbe({ 'x-daily-ratelimit-token-remaining': '5000' })

    const err = await runCmd(QuotaCommand, ['--threshold', '10']).catch(
      (e) => e,
    )

    expect(err.oclif.exit).toBe(69)
    expect(err.message).toMatch(/threshold/i)
    expect(err.stdout).toContain('5000')
    expect(err.stdout).toContain('n/a')
  })

  it('still gates on --min when the limit header is absent (needs only remaining)', async () => {
    mockProbe({ 'x-daily-ratelimit-token-remaining': '500' })

    const err = await runCmd(QuotaCommand, ['--min', '1000']).catch((e) => e)
    expect(err.oclif.exit).toBe(75)
    expect(err.message).toMatch(/min/i)
  })

  describe('probe that is itself rate-limited (Finding C)', () => {
    it('prints the reading and exits 0 (no gate) when the daily budget is exhausted', async () => {
      // The probe 429s with an exhausted budget — the transport would throw
      // RateLimitError (75) before quota prints. quota must swallow it, read
      // lastRateLimit (snapshotted off the 429), and print the reading.
      mockApi().get('/api/v1/users/me').reply(
        429,
        {},
        {
          'x-daily-ratelimit-token-remaining': '0',
          'x-daily-ratelimit-token-limit': '150000',
          'x-ratelimit-reset': '5',
        },
      )

      const stdout = await runCmd(QuotaCommand, ['--output', 'json'])
      expect(JSON.parse(stdout)).toEqual({
        daily: { remaining: 0, limit: 150000, pct: 0 },
        reset: 5,
      })
    })

    it('prints the reading first, then still exits 75 under --min', async () => {
      mockApi().get('/api/v1/users/me').reply(
        429,
        {},
        {
          'x-daily-ratelimit-token-remaining': '0',
          'x-daily-ratelimit-token-limit': '150000',
        },
      )

      const err = await runCmd(QuotaCommand, [
        '--min',
        '1000',
        '--output',
        'json',
      ]).catch((e) => e)

      expect(err.oclif.exit).toBe(75)
      expect(JSON.parse(err.stdout)).toMatchObject({ daily: { remaining: 0 } })
    })

    it('prints the last-seen reading when a burst 429 surfaces under --no-retry', async () => {
      mockApi().get('/api/v1/users/me').reply(
        429,
        {},
        {
          'x-daily-ratelimit-token-remaining': '4100',
          'x-daily-ratelimit-token-limit': '150000',
          'x-ratelimit-reset': '2',
        },
      )

      const stdout = await runCmd(QuotaCommand, [
        '--no-retry',
        '--output',
        'json',
      ])
      expect(JSON.parse(stdout)).toEqual({
        daily: { remaining: 4100, limit: 150000, pct: 3 },
        reset: 2,
      })
    })

    it('re-throws a non-rate-limit probe error unchanged (e.g. 5xx)', async () => {
      mockApi()
        .get('/api/v1/users/me')
        .reply(500, { success: false, error: 'boom' })

      const err = await runCmd(QuotaCommand, ['--no-retry']).catch((e) => e)
      expect(err.oclif.exit).toBe(69)
    })
  })
})
