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

const { default: LeadConvertCommand } =
  await import('../../../src/commands/lead/convert.js')
import { runCmd, mockApi } from '../../helpers.js'

const LEAD = 'adf21080-0e10-11eb-879b-05d71fb426ec'
const CONVERSION = '4b40248b-945a-4802-b996-60fdff8c5c69'

const REAL_SLEEP = LeadConvertCommand.sleepFn

describe('lead convert', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
    LeadConvertCommand.sleepFn = REAL_SLEEP
  })

  it('POSTs the conversion and prints the conversion id and status command', async () => {
    const scope = mockApi()
      .post(`/api/v2/leads/${LEAD}/convert/deal`, {})
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION },
        additional_data: null,
      })

    const stdout = await runCmd(LeadConvertCommand, [LEAD])

    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain(CONVERSION)
    expect(stdout).toContain(
      `api GET /api/v2/leads/${LEAD}/convert/status/${CONVERSION}`,
    )
  })

  it('passes --stage and --pipeline in the body', async () => {
    const scope = mockApi()
      .post(`/api/v2/leads/${LEAD}/convert/deal`, {
        stage_id: 7,
        pipeline_id: 3,
      })
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION },
      })

    await runCmd(LeadConvertCommand, [LEAD, '--stage', '7', '--pipeline', '3'])

    expect(scope.isDone()).toBe(true)
  })

  it('--wait polls until completed and prints the new deal id', async () => {
    const scope = mockApi()
      .post(`/api/v2/leads/${LEAD}/convert/deal`, {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/leads/${LEAD}/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'running' },
      })
      .get(`/api/v2/leads/${LEAD}/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'completed', deal_id: 33 },
      })

    const sleep = vi.fn().mockResolvedValue(undefined)
    LeadConvertCommand.sleepFn = sleep
    const stdout = await runCmd(LeadConvertCommand, [LEAD, '--wait'])

    expect(scope.isDone()).toBe(true)
    expect(sleep).toHaveBeenCalledWith(2000)
    expect(stdout).toContain('33')
    expect(stdout).toMatch(/completed/i)
  })

  it('--wait throws when the conversion fails', async () => {
    mockApi()
      .post(`/api/v2/leads/${LEAD}/convert/deal`, {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/leads/${LEAD}/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'failed' },
      })

    LeadConvertCommand.sleepFn = vi.fn().mockResolvedValue(undefined)
    await expect(LeadConvertCommand.run([LEAD, '--wait'])).rejects.toThrow(
      /failed/i,
    )
  })

  it('--wait throws when the conversion is rejected', async () => {
    mockApi()
      .post(`/api/v2/leads/${LEAD}/convert/deal`, {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/leads/${LEAD}/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'rejected' },
      })

    LeadConvertCommand.sleepFn = vi.fn().mockResolvedValue(undefined)
    await expect(LeadConvertCommand.run([LEAD, '--wait'])).rejects.toThrow(
      /reject/i,
    )
  })

  it('--wait times out after --timeout-secs without a terminal status', async () => {
    mockApi()
      .post(`/api/v2/leads/${LEAD}/convert/deal`, {})
      .reply(200, { success: true, data: { conversion_id: CONVERSION } })
      .get(`/api/v2/leads/${LEAD}/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'running' },
      })
      .get(`/api/v2/leads/${LEAD}/convert/status/${CONVERSION}`)
      .reply(200, {
        success: true,
        data: { conversion_id: CONVERSION, status: 'running' },
      })

    LeadConvertCommand.sleepFn = vi.fn().mockResolvedValue(undefined)
    await expect(
      LeadConvertCommand.run([LEAD, '--wait', '--timeout-secs', '2']),
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

  it('requires the lead id positional', async () => {
    await expect(LeadConvertCommand.run([])).rejects.toThrow()
  })
})
