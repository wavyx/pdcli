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

const { default: SlippageCommand } =
  await import('../../../src/commands/metrics/slippage.js')
import { runCmd, mockApi } from '../../helpers.js'

const OPEN_DEALS = {
  success: true,
  data: [
    {
      id: 10,
      title: 'Acme',
      status: 'open',
      stage_id: 1,
      owner_id: 7,
      expected_close_date: '2026-08-01',
    },
    {
      id: 11,
      title: 'Beta',
      status: 'open',
      stage_id: 1,
      owner_id: 3,
      expected_close_date: '2026-07-05',
    },
  ],
}

function changelog(dealId, rows) {
  mockApi()
    .get(`/api/v1/deals/${dealId}/changelog`)
    .query(true)
    .reply(200, { success: true, data: rows, additional_data: {} })
}

function mockBaseFetch() {
  mockApi()
    .get('/api/v2/deals')
    .query((q) => q.status === 'open' && q.pipeline_id === '1')
    .reply(200, OPEN_DEALS)
}

describe('metrics slippage', () => {
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

  it('reports per-deal close-date slippage as JSON, net-slip descending', async () => {
    mockBaseFetch()
    // Acme: 07-10 -> 08-01 (22d), then 07-01 -> 07-10 (9d) = 31d net, 2 pushes
    changelog(10, [
      {
        field_key: 'expected_close_date',
        old_value: '2026-07-10',
        new_value: '2026-08-01',
        time: '2026-06-20T10:00:00Z',
      },
      {
        field_key: 'expected_close_date',
        old_value: '2026-07-01',
        new_value: '2026-07-10',
        time: '2026-06-05T10:00:00Z',
      },
    ])
    // Beta: 07-01 -> 07-05 (4d), 1 push
    changelog(11, [
      {
        field_key: 'expected_close_date',
        old_value: '2026-07-01',
        new_value: '2026-07-05',
        time: '2026-06-05T10:00:00Z',
      },
    ])

    const stdout = await runCmd(SlippageCommand, [
      '--pipeline',
      '1',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows.map((r) => r.dealId)).toEqual([10, 11])
    expect(rows[0]).toMatchObject({
      dealId: 10,
      title: 'Acme',
      ownerId: 7,
      pushCount: 2,
      netDaysSlipped: 31,
      originalCloseDate: '2026-07-01',
      currentCloseDate: '2026-08-01',
    })
  })

  it('renders a table with deal, owner, pushes, net slip and date range', async () => {
    mockBaseFetch()
    changelog(10, [
      {
        field_key: 'expected_close_date',
        old_value: '2026-07-01',
        new_value: '2026-08-01',
        time: '2026-06-05T10:00:00Z',
      },
    ])
    changelog(11, [])

    const stdout = await runCmd(SlippageCommand, [
      '--pipeline',
      '1',
      '--output',
      'table',
    ])

    expect(stdout).toContain('Acme')
    expect(stdout).toContain('2026-07-01')
    expect(stdout).toContain('2026-08-01')
    // Beta has no pushes -> filtered out of the default min-pushes=1 view.
    expect(stdout).not.toContain('Beta')
  })

  it('honors --min-pushes to filter low-churn deals', async () => {
    mockBaseFetch()
    // Acme: 2 pushes
    changelog(10, [
      {
        field_key: 'expected_close_date',
        old_value: '2026-07-10',
        new_value: '2026-08-01',
        time: '2026-06-20T10:00:00Z',
      },
      {
        field_key: 'expected_close_date',
        old_value: '2026-07-01',
        new_value: '2026-07-10',
        time: '2026-06-05T10:00:00Z',
      },
    ])
    // Beta: 1 push only
    changelog(11, [
      {
        field_key: 'expected_close_date',
        old_value: '2026-07-01',
        new_value: '2026-07-05',
        time: '2026-06-05T10:00:00Z',
      },
    ])

    const stdout = await runCmd(SlippageCommand, [
      '--pipeline',
      '1',
      '--min-pushes',
      '2',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows.map((r) => r.dealId)).toEqual([10])
  })

  it('resolves a single pipeline automatically when --pipeline is omitted', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'Sales' }] })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open' && q.pipeline_id === '1')
      .reply(200, OPEN_DEALS)
    changelog(10, [
      {
        field_key: 'expected_close_date',
        old_value: '2026-07-01',
        new_value: '2026-08-01',
        time: '2026-06-05T10:00:00Z',
      },
    ])
    changelog(11, [])

    const stdout = await runCmd(SlippageCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)
    expect(rows[0].dealId).toBe(10)
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
      await SlippageCommand.run([])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.exitCode ?? caught.oclif?.exit).toBe(64)
    expect(caught.message).toMatch(/--pipeline/)
  })

  it('handles an account with no pipelines (undefined pipeline id)', async () => {
    mockApi().get('/api/v2/pipelines').reply(200, { success: true })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(SlippageCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual([])
  })
})
