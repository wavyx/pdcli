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

const { default: ForecastCommand } =
  await import('../../../src/commands/metrics/forecast.js')
import { runCmd, mockApi } from '../../helpers.js'

const STAGES = {
  success: true,
  data: [
    {
      id: 1,
      name: 'Qualify',
      pipeline_id: 1,
      order_nr: 0,
      deal_probability: 40,
    },
    {
      id: 2,
      name: 'Propose',
      pipeline_id: 1,
      order_nr: 1,
      deal_probability: 80,
    },
  ],
}

const OPEN_DEALS = {
  success: true,
  data: [
    {
      id: 10,
      stage_id: 1,
      value: 100000,
      currency: 'USD',
      probability: null,
      expected_close_date: '2026-07-15',
    },
    {
      id: 11,
      stage_id: 2,
      value: 50000,
      currency: 'USD',
      probability: 90,
      expected_close_date: '2026-08-01',
    },
    {
      id: 12,
      stage_id: 2,
      value: 40000,
      currency: 'EUR',
      probability: null,
      expected_close_date: '2026-07-10',
    },
  ],
}

function mockFetch(deals = OPEN_DEALS) {
  mockApi()
    .get('/api/v2/stages')
    .query((q) => q.pipeline_id === '1')
    .reply(200, STAGES)
  mockApi()
    .get('/api/v2/deals')
    .query((q) => q.status === 'open' && q.pipeline_id === '1')
    .reply(200, deals)
}

describe('metrics forecast', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })
  afterEach(() => nock.cleanAll())

  it('emits per-currency rows and totals as JSON', async () => {
    mockFetch()
    const stdout = await runCmd(ForecastCommand, [
      '--pipeline',
      '1',
      '--output',
      'json',
    ])
    const f = JSON.parse(stdout)

    expect(f.rows).toHaveLength(3)
    const usd = f.totals.find((t) => t.currency === 'USD')
    expect(usd.bestCase).toBe(150000)
    expect(usd.weighted).toBe(85000)
    expect(usd.commit).toBe(50000) // only the 90% deal at 70 threshold
    const eur = f.totals.find((t) => t.currency === 'EUR')
    expect(eur.commit).toBe(40000)
  })

  it('honors a lower --commit-threshold', async () => {
    mockFetch()
    const stdout = await runCmd(ForecastCommand, [
      '--pipeline',
      '1',
      '--commit-threshold',
      '30',
      '--output',
      'json',
    ])
    const f = JSON.parse(stdout)
    const usd = f.totals.find((t) => t.currency === 'USD')
    // now the 40% deal also commits: 100000 + 50000
    expect(usd.commit).toBe(150000)
  })

  it('renders a table with month buckets and a totals section', async () => {
    mockFetch()
    const stdout = await runCmd(ForecastCommand, [
      '--pipeline',
      '1',
      '--output',
      'table',
    ])
    expect(stdout).toContain('2026-07')
    expect(stdout).toContain('USD')
    expect(stdout).toContain('EUR')
    expect(stdout.toLowerCase()).toContain('total')
  })

  it('auto-resolves a single pipeline when --pipeline is omitted', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'Sales' }] })
    mockFetch()
    const stdout = await runCmd(ForecastCommand, ['--output', 'json'])
    expect(JSON.parse(stdout).rows.length).toBe(3)
  })

  it('errors with exit 64 when several pipelines exist and none is chosen', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'Sales' },
          { id: 2, name: 'Partners' },
        ],
      })
    const err = await ForecastCommand.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--pipeline/)
  })

  it('shows no results for an empty pipeline', async () => {
    mockFetch({ success: true, data: [] })
    const stdout = await runCmd(ForecastCommand, [
      '--pipeline',
      '1',
      '--output',
      'table',
    ])
    expect(stdout.toLowerCase()).toContain('no results')
  })
})
