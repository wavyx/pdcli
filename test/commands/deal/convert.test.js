import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const mockConfirmAction = vi.fn()
vi.mock('../../../src/lib/confirm.js', () => ({
  confirmAction: mockConfirmAction,
}))

const { default: DealConvertCommand } =
  await import('../../../src/commands/deal/convert.js')
import { runCmd, mockApi } from '../../helpers.js'

const CONVERSION = '4b40248b-945a-4802-b996-60fdff8c5c69'
const LEAD = '9f3e6e50-9d99-11ee-9538-29c81a92c0d1'

const REAL_SLEEP = DealConvertCommand.sleepFn

describe('deal convert', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockConfirmAction.mockReset()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
    DealConvertCommand.sleepFn = REAL_SLEEP
  })

  it('confirms (default no) then POSTs and prints the conversion id', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .post('/api/v2/deals/42/convert/lead', {})
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION },
        additional_data: null,
      })

    const stdout = await runCmd(DealConvertCommand, ['42'])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining('42'),
      false,
      { default: false },
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain(CONVERSION)
    expect(stdout).toContain(
      `api GET /api/v2/deals/42/convert/status/${CONVERSION}`,
    )
  })

  it('aborts without converting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(DealConvertCommand.run(['42'])).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .post('/api/v2/deals/42/convert/lead', {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })

    await runCmd(DealConvertCommand, ['42', '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true, {
      default: false,
    })
    expect(scope.isDone()).toBe(true)
  })

  it('--wait polls until completed and prints the new lead id', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .post('/api/v2/deals/42/convert/lead', {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/deals/42/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'running' },
      })
      .get(`/api/v2/deals/42/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'completed', lead_id: LEAD },
      })

    const sleep = vi.fn().mockResolvedValue(undefined)
    DealConvertCommand.sleepFn = sleep
    const stdout = await runCmd(DealConvertCommand, ['42', '--yes', '--wait'])

    expect(scope.isDone()).toBe(true)
    expect(sleep).toHaveBeenCalledWith(2000)
    expect(stdout).toContain(LEAD)
    expect(stdout).toMatch(/completed/i)
  })

  it('--wait throws when the conversion fails', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .post('/api/v2/deals/42/convert/lead', {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/deals/42/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'failed' },
      })

    DealConvertCommand.sleepFn = vi.fn().mockResolvedValue(undefined)
    const err = await DealConvertCommand.run(['42', '--yes', '--wait']).catch(
      (e) => e,
    )
    expect(err.message).toMatch(/failed/i)
    // A server-rejected conversion is bad data (65), NOT an internal bug (70).
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
  })

  it('--wait throws when rejected', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .post('/api/v2/deals/42/convert/lead', {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/deals/42/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'rejected' },
      })

    DealConvertCommand.sleepFn = vi.fn().mockResolvedValue(undefined)
    const err = await DealConvertCommand.run(['42', '--yes', '--wait']).catch(
      (e) => e,
    )
    expect(err.message).toMatch(/reject/i)
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
  })

  it('--output json exposes conversion_id and the new lead_id (not prose-only)', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .post('/api/v2/deals/42/convert/lead', {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/deals/42/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'completed', lead_id: LEAD },
      })

    DealConvertCommand.sleepFn = vi.fn().mockResolvedValue(undefined)
    const stdout = await runCmd(DealConvertCommand, [
      '42',
      '--yes',
      '--wait',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual({
      conversion_id: CONVERSION,
      status: 'completed',
      deal_id: 42,
      lead_id: LEAD,
    })
  })

  it('--wait times out after --timeout-secs without a terminal status', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .post('/api/v2/deals/42/convert/lead', {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/deals/42/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'running' },
      })
      .get(`/api/v2/deals/42/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'running' },
      })

    DealConvertCommand.sleepFn = vi.fn().mockResolvedValue(undefined)
    await expect(
      DealConvertCommand.run(['42', '--yes', '--wait', '--timeout-secs', '2']),
    ).rejects.toThrow(/timed out|timeout/i)
  })

  it('the default sleep resolves after the given delay (fake timers)', async () => {
    // Exercise the real defaultSleep in isolation — no command, no nock — so
    // fake timers never collide with the HTTP transport's own timers.
    vi.useFakeTimers()
    try {
      let resolved = false
      const promise = REAL_SLEEP(2000).then(() => {
        resolved = true
      })
      await vi.advanceTimersByTimeAsync(2000)
      await promise
      expect(resolved).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('requires the deal id positional', async () => {
    await expect(DealConvertCommand.run([])).rejects.toThrow()
  })
})
