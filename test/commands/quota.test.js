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

  it('reports pct as n/a when remaining is known but limit is not', async () => {
    mockProbe({ 'x-daily-ratelimit-token-remaining': '5000' })

    // --min still gates on the absolute remaining; --threshold can't (no pct).
    const stdout = await runCmd(QuotaCommand, ['--threshold', '10'])
    expect(stdout).toContain('5000')
    expect(stdout).toContain('n/a')
  })
})
