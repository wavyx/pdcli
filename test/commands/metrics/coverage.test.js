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

const { default: CoverageCommand } =
  await import('../../../src/commands/metrics/coverage.js')
import { runCmd, mockApi } from '../../helpers.js'

const STAGES = {
  success: true,
  data: [
    {
      id: 1,
      name: 'Qualified',
      pipeline_id: 1,
      order_nr: 0,
      deal_probability: 50,
    },
    { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1, deal_probability: 100 },
  ],
}

// weighted open: deal A 100000 @ 50% = 50000; deal B 130000 @ 100% = 130000
// → weightedOpen = 180000
const OPEN_DEALS = {
  success: true,
  data: [
    { id: 10, status: 'open', stage_id: 1, value: 100000, probability: null },
    { id: 11, status: 'open', stage_id: 2, value: 130000, probability: null },
  ],
}

function mockPipelineHealthFetch() {
  mockApi()
    .get('/api/v2/stages')
    .query((q) => q.pipeline_id === '1')
    .reply(200, STAGES)
  mockApi()
    .get('/api/v2/deals')
    .query((q) => q.status === 'open' && q.pipeline_id === '1')
    .reply(200, OPEN_DEALS)
}

describe('metrics coverage', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('computes coverage from an active revenue goal (find + results)', async () => {
    mockPipelineHealthFetch()

    // /goals/find returns several goals; only revenue ones must be kept.
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          goals: [
            // kept: type.name revenue_forecast
            {
              id: 'aaa111',
              type: { name: 'revenue_forecast' },
              expected_outcome: { target: 60000, tracking_metric: 'sum' },
            },
            // dropped: a non-revenue quantity goal
            {
              id: 'bbb222',
              type: { name: 'deals_won' },
              expected_outcome: { target: 99, tracking_metric: 'quantity' },
            },
            // dropped: an unknown sum goal is NOT a revenue goal when a real
            // revenue_forecast goal exists
            {
              id: 'ccc333',
              type: { name: 'pipeline_velocity' },
              expected_outcome: { target: 40000, tracking_metric: 'sum' },
            },
          ],
        },
      })

    mockApi()
      .get('/api/v1/goals/aaa111/results')
      .query(true)
      .reply(200, { success: true, data: { progress: 25000 } })

    const stdout = await runCmd(CoverageCommand, [
      '--pipeline',
      '1',
      '--output',
      'json',
    ])
    const c = JSON.parse(stdout)

    // only the revenue_forecast goal counts: target 60000, progress 25000
    // remaining = 35000; coverage = 180000 / 35000 ≈ 5.14 → healthy
    expect(c.weightedOpen).toBe(180000)
    expect(c.goalTarget).toBe(60000)
    expect(c.progress).toBe(25000)
    expect(c.remaining).toBe(35000)
    expect(c.coverage).toBeCloseTo(180000 / 35000)
    expect(c.verdict).toBe('healthy')
  })

  it('sends paired period.start and period.end to find and results', async () => {
    mockPipelineHealthFetch()

    let findQuery
    let resultsQuery
    mockApi()
      .get('/api/v1/goals/find')
      .query((q) => {
        findQuery = q
        return true
      })
      .reply(200, {
        success: true,
        data: {
          goals: [
            {
              id: 'g1',
              type: { name: 'revenue_forecast' },
              expected_outcome: { target: 100000, tracking_metric: 'sum' },
            },
          ],
        },
      })
    mockApi()
      .get('/api/v1/goals/g1/results')
      .query((q) => {
        resultsQuery = q
        return true
      })
      .reply(200, { success: true, data: { progress: 0 } })

    await runCmd(CoverageCommand, ['--pipeline', '1', '--output', 'json'])

    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    expect(findQuery['period.start']).toMatch(dateRe)
    expect(findQuery['period.end']).toMatch(dateRe)
    expect(resultsQuery['period.start']).toMatch(dateRe)
    expect(resultsQuery['period.end']).toMatch(dateRe)
  })

  it('bypasses the Goals API entirely with --target', async () => {
    mockPipelineHealthFetch()
    // No goals mocks registered: if the command hits the Goals API the
    // request will fail (nock has no interceptor) and the test will error.

    const stdout = await runCmd(CoverageCommand, [
      '--pipeline',
      '1',
      '--target',
      '90000',
      '--output',
      'json',
    ])
    const c = JSON.parse(stdout)

    // target 90000, progress 0, remaining 90000; coverage 180000/90000 = 2
    expect(c.goalTarget).toBe(90000)
    expect(c.progress).toBe(0)
    expect(c.coverage).toBeCloseTo(2)
    expect(c.verdict).toBe('borderline')
  })

  it('errors with exit 64 when no active revenue goal exists', async () => {
    mockPipelineHealthFetch()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          goals: [
            // only a non-revenue goal → filtered out → no revenue goal
            {
              id: 'q1',
              type: { name: 'deals_won' },
              expected_outcome: { target: 10, tracking_metric: 'quantity' },
            },
          ],
        },
      })

    let caught
    try {
      await CoverageCommand.run(['--pipeline', '1'])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.exitCode ?? caught.oclif?.exit).toBe(64)
    expect(caught.message).toMatch(/no active revenue goal/i)
  })

  it('renders a table with the coverage ratio and verdict line', async () => {
    mockPipelineHealthFetch()

    const stdout = await runCmd(CoverageCommand, [
      '--pipeline',
      '1',
      '--target',
      '90000',
      '--output',
      'table',
    ])

    expect(stdout).toContain('Weighted pipeline')
    expect(stdout).toContain('Quota')
    expect(stdout).toContain('Remaining')
    expect(stdout).toContain('2.0x')
    expect(stdout.toLowerCase()).toContain('borderline')
  })

  it('renders "covered" in the table when progress meets the target', async () => {
    mockPipelineHealthFetch()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          goals: [
            {
              id: 'g1',
              type: { name: 'revenue_forecast' },
              expected_outcome: { target: 100000, tracking_metric: 'sum' },
            },
          ],
        },
      })
    mockApi()
      .get('/api/v1/goals/g1/results')
      .query(true)
      .reply(200, { success: true, data: { progress: 120000 } })

    const stdout = await runCmd(CoverageCommand, [
      '--pipeline',
      '1',
      '--output',
      'table',
    ])

    expect(stdout.toLowerCase()).toContain('covered')
  })

  it('resolves a single pipeline automatically when --pipeline is omitted', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'Sales' }] })
    mockApi()
      .get('/api/v2/stages')
      .query((q) => q.pipeline_id === '1')
      .reply(200, STAGES)
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open' && q.pipeline_id === '1')
      .reply(200, OPEN_DEALS)

    const stdout = await runCmd(CoverageCommand, [
      '--target',
      '90000',
      '--output',
      'json',
    ])
    const c = JSON.parse(stdout)
    expect(c.weightedOpen).toBe(180000)
  })

  it('errors with exit 64 when the account has several pipelines', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'Sales' },
          { id: 2, name: 'Partners' },
        ],
      })

    let caught
    try {
      await CoverageCommand.run(['--target', '90000'])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.exitCode ?? caught.oclif?.exit).toBe(64)
    expect(caught.message).toMatch(/--pipeline/)
  })

  it('errors with exit 64 when find returns no goals key at all', async () => {
    mockPipelineHealthFetch()
    // data has no `goals` property → the optional chain falls back to []
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, { success: true, data: {} })

    let caught
    try {
      await CoverageCommand.run(['--pipeline', '1'])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.exitCode ?? caught.oclif?.exit).toBe(64)
    expect(caught.message).toMatch(/no active revenue goal/i)
  })

  it('treats a goal with no target and a result with no progress as zero', async () => {
    mockPipelineHealthFetch()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          goals: [
            // kept by tracking_metric=sum, but expected_outcome lacks a target
            { id: 'g1', expected_outcome: { tracking_metric: 'sum' } },
          ],
        },
      })
    // results envelope has no progress field
    mockApi()
      .get('/api/v1/goals/g1/results')
      .query(true)
      .reply(200, { success: true, data: {} })

    const stdout = await runCmd(CoverageCommand, [
      '--pipeline',
      '1',
      '--output',
      'json',
    ])
    const c = JSON.parse(stdout)

    // target falls back to 0 and progress to 0 → remaining 0 → covered
    expect(c.goalTarget).toBe(0)
    expect(c.progress).toBe(0)
    expect(c.remaining).toBe(0)
    expect(c.coverage).toBeNull()
    expect(c.verdict).toBe('covered')
  })

  it('errors with exit 64 when matched goals use multiple currencies', async () => {
    mockPipelineHealthFetch()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          goals: [
            {
              id: 'usd1',
              type: { name: 'revenue_forecast' },
              expected_outcome: {
                target: 60000,
                tracking_metric: 'sum',
                currency_id: 1,
              },
            },
            {
              id: 'eur1',
              type: { name: 'revenue_forecast' },
              expected_outcome: {
                target: 40000,
                tracking_metric: 'sum',
                currency_id: 2,
              },
            },
          ],
        },
      })

    let caught
    try {
      await CoverageCommand.run(['--pipeline', '1'])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.exitCode ?? caught.oclif?.exit).toBe(64)
    expect(caught.message).toMatch(/multiple currencies/i)
    expect(caught.message).toMatch(/1/)
    expect(caught.message).toMatch(/2/)
    expect(caught.message).toMatch(/--target/)
  })

  it('matches a display-cased "Revenue forecast" goal type', async () => {
    mockPipelineHealthFetch()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          goals: [
            {
              id: 'disp1',
              type: { name: 'Revenue forecast' },
              expected_outcome: { target: 90000, tracking_metric: 'sum' },
            },
          ],
        },
      })
    mockApi()
      .get('/api/v1/goals/disp1/results')
      .query(true)
      .reply(200, { success: true, data: { progress: 0 } })

    const stdout = await runCmd(CoverageCommand, [
      '--pipeline',
      '1',
      '--output',
      'json',
    ])
    const c = JSON.parse(stdout)
    expect(c.goalTarget).toBe(90000)
  })

  it('excludes a deals_won sum goal when a revenue_forecast goal exists', async () => {
    mockPipelineHealthFetch()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          goals: [
            {
              id: 'rev1',
              type: { name: 'revenue_forecast' },
              expected_outcome: { target: 100000, tracking_metric: 'sum' },
            },
            // deals_won with sum tracking metric: must NOT join the quota
            {
              id: 'won1',
              type: { name: 'deals_won' },
              expected_outcome: { target: 500000, tracking_metric: 'sum' },
            },
          ],
        },
      })
    mockApi()
      .get('/api/v1/goals/rev1/results')
      .query(true)
      .reply(200, { success: true, data: { progress: 0 } })
    // No results interceptor for won1: if it were matched the request would
    // fail (nock has no interceptor) and the target would be wrong anyway.

    const stdout = await runCmd(CoverageCommand, [
      '--pipeline',
      '1',
      '--output',
      'json',
    ])
    const c = JSON.parse(stdout)
    expect(c.goalTarget).toBe(100000)
  })

  it('falls back to a deals_won-only sum goal and emits a stderr note', async () => {
    mockPipelineHealthFetch()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          goals: [
            {
              id: 'won1',
              type: { name: 'deals_won' },
              expected_outcome: { target: 70000, tracking_metric: 'sum' },
            },
          ],
        },
      })
    mockApi()
      .get('/api/v1/goals/won1/results')
      .query(true)
      .reply(200, { success: true, data: { progress: 0 } })

    const stderrChunks = []
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrChunks.push(String(chunk))
        return true
      })

    let stdout
    try {
      stdout = await runCmd(CoverageCommand, [
        '--pipeline',
        '1',
        '--output',
        'json',
      ])
    } finally {
      stderrSpy.mockRestore()
    }

    const c = JSON.parse(stdout)
    expect(c.goalTarget).toBe(70000)
    const note = stderrChunks.join('')
    expect(note).toMatch(/deals_won/)
  })

  it('handles an account with no pipelines (undefined pipeline id)', async () => {
    // pipelines envelope without a data array → falls back to [] then undefined id
    mockApi().get('/api/v2/pipelines').reply(200, { success: true })
    mockApi()
      .get('/api/v2/stages')
      .query((q) => q.pipeline_id === undefined)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(CoverageCommand, [
      '--target',
      '50000',
      '--output',
      'json',
    ])
    const c = JSON.parse(stdout)
    expect(c.weightedOpen).toBe(0)
    expect(c.goalTarget).toBe(50000)
  })
})
