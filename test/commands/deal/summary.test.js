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

const { default: DealSummaryCommand } =
  await import('../../../src/commands/deal/summary.js')
import { runCmd, mockApi } from '../../helpers.js'

const SUMMARY_REPLY = {
  success: true,
  data: {
    values_total: {
      EUR: {
        value: 10,
        count: 2,
        value_converted: 11.1,
        value_formatted: '€10',
        value_converted_formatted: 'US$11.10',
      },
      USD: {
        value: 30,
        count: 3,
        value_converted: 30,
        value_formatted: 'US$30',
        value_converted_formatted: 'US$30',
      },
    },
    weighted_values_total: {
      EUR: { value: 8, count: 2, value_formatted: '€8' },
      USD: { value: 24, count: 3, value_formatted: 'US$24' },
    },
    total_count: 5,
    total_currency_converted_value: 41.1,
    total_weighted_currency_converted_value: 32,
    total_currency_converted_value_formatted: 'US$41.1',
    total_weighted_currency_converted_value_formatted: 'US$32',
  },
}

describe('deal summary', () => {
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
  })

  it('outputs the raw summary data object as JSON', async () => {
    mockApi().get('/api/v1/deals/summary').query({}).reply(200, SUMMARY_REPLY)

    const stdout = await runCmd(DealSummaryCommand, ['--output', 'json'])
    const data = JSON.parse(stdout)

    expect(data.total_count).toBe(5)
    expect(data.values_total.EUR.value).toBe(10)
    expect(data.weighted_values_total.USD.value).toBe(24)
  })

  it('renders a table with one row per currency (total/weighted/count)', async () => {
    mockApi().get('/api/v1/deals/summary').query({}).reply(200, SUMMARY_REPLY)

    const stdout = await runCmd(DealSummaryCommand, ['--output', 'table'])

    expect(stdout).toContain('EUR')
    expect(stdout).toContain('USD')
    // total value formatted per currency
    expect(stdout).toContain('€10')
    expect(stdout).toContain('US$30')
    // weighted value formatted per currency
    expect(stdout).toContain('€8')
    expect(stdout).toContain('US$24')
    // per-currency deal count
    expect(stdout).toContain('2')
    expect(stdout).toContain('3')
  })

  it('passes status, pipeline, stage and filter as query params', async () => {
    mockApi()
      .get('/api/v1/deals/summary')
      .query({
        status: 'won',
        pipeline_id: '1',
        stage_id: '3',
        filter_id: '7',
      })
      .reply(200, SUMMARY_REPLY)

    const stdout = await runCmd(DealSummaryCommand, [
      '--status',
      'won',
      '--pipeline',
      '1',
      '--stage',
      '3',
      '--filter',
      '7',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).total_count).toBe(5)
  })
})

describe('deal summary edge cases', () => {
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
  })

  it('renders an empty table when there are no deals', async () => {
    mockApi()
      .get('/api/v1/deals/summary')
      .query({})
      .reply(200, {
        success: true,
        data: {
          values_total: {},
          weighted_values_total: {},
          total_count: 0,
        },
      })

    const stdout = await runCmd(DealSummaryCommand, ['--output', 'table'])

    expect(stdout).toContain('No results found.')
  })

  it('renders a row even when a currency lacks a weighted entry', async () => {
    mockApi()
      .get('/api/v1/deals/summary')
      .query({})
      .reply(200, {
        success: true,
        data: {
          values_total: {
            EUR: { value: 10, count: 2, value_formatted: '€10' },
          },
          weighted_values_total: {},
          total_count: 2,
        },
      })

    const stdout = await runCmd(DealSummaryCommand, ['--output', 'table'])

    expect(stdout).toContain('EUR')
    expect(stdout).toContain('€10')
  })

  it('falls back to the raw value when a group omits value_formatted', async () => {
    mockApi()
      .get('/api/v1/deals/summary')
      .query({})
      .reply(200, {
        success: true,
        data: {
          values_total: {
            EUR: { value: 12, count: 1 },
          },
          weighted_values_total: {
            EUR: { value: 9, count: 1 },
          },
          total_count: 1,
        },
      })

    const stdout = await runCmd(DealSummaryCommand, ['--output', 'table'])

    expect(stdout).toContain('EUR')
    expect(stdout).toContain('12')
    expect(stdout).toContain('9')
  })

  it('renders an empty table when the 200 carries no data object', async () => {
    mockApi()
      .get('/api/v1/deals/summary')
      .query({})
      .reply(200, { success: true })

    const stdout = await runCmd(DealSummaryCommand, ['--output', 'table'])

    expect(stdout).toContain('No results found.')
  })

  it('outputs an empty object as JSON when the 200 carries no data', async () => {
    mockApi()
      .get('/api/v1/deals/summary')
      .query({})
      .reply(200, { success: true })

    const stdout = await runCmd(DealSummaryCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual({})
  })
})
