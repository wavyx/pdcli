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

const { default: AgingCommand } =
  await import('../../../src/commands/metrics/aging.js')
import { runCmd, mockApi } from '../../helpers.js'

const DAY = 86_400_000
function daysAgo(n) {
  return new Date(Date.now() - n * DAY).toISOString()
}

const STAGES = [
  { id: 1, name: 'Qualified', pipeline_id: 1, order_nr: 0 },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1 },
]

const stageRow = (oldId, newId, time) => ({
  field_key: 'stage_id',
  old_value: oldId == null ? null : String(oldId),
  new_value: String(newId),
  time,
})

describe('metrics aging', () => {
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

  function mockScope({ pipelines, openDeals }) {
    if (pipelines) {
      mockApi()
        .get('/api/v2/pipelines')
        .reply(200, { success: true, data: pipelines })
    }
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, { success: true, data: openDeals })
  }

  function mockChangelog(dealId, rows) {
    mockApi()
      .get(`/api/v1/deals/${dealId}/changelog`)
      .query(true)
      .reply(200, {
        success: true,
        data: rows,
        additional_data: { next_cursor: null },
      })
  }

  it('buckets open deals by days-in-stage and reports JSON', async () => {
    mockScope({
      pipelines: [{ id: 1, name: 'P' }],
      openDeals: [
        { id: 10, stage_id: 1, value: 100 },
        { id: 11, stage_id: 1, value: 200 },
      ],
    })
    mockChangelog(10, [stageRow(0, 1, daysAgo(5))]) // 0-30
    mockChangelog(11, [stageRow(0, 1, daysAgo(45))]) // 30-60

    const stdout = await runCmd(AgingCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)

    const s1 = rows.find((r) => r.stageId === 1)
    expect(s1.buckets['0-30'].count).toBe(1)
    expect(s1.buckets['30-60'].count).toBe(1)
    expect(s1.buckets['30-60'].value).toBe(200)
  })

  it('renders a table with bucket columns and a p90-exceeded flag', async () => {
    mockScope({
      pipelines: [{ id: 1, name: 'P' }],
      openDeals: [{ id: 10, stage_id: 1, value: 100 }],
    })
    mockChangelog(10, [stageRow(0, 1, daysAgo(5))])

    const stdout = await runCmd(AgingCommand, ['--output', 'table'])
    expect(stdout).toContain('Qualified')
    expect(stdout).toContain('0-30')
    expect(stdout).toContain('90+')
    expect(stdout).toContain('p90')
  })

  it('exits 64 when several pipelines exist and --pipeline is omitted', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
      })

    await expect(AgingCommand.run([])).rejects.toMatchObject({
      oclif: { exit: 64 },
    })
  })

  it('skips the pipelines lookup when --pipeline is given', async () => {
    nock.disableNetConnect()
    try {
      nock.enableNetConnect('acme.pipedrive.com')
      mockScope({ openDeals: [{ id: 10, stage_id: 1, value: 100 }] })
      mockChangelog(10, [stageRow(0, 1, daysAgo(5))])
      const stdout = await runCmd(AgingCommand, [
        '--pipeline',
        '1',
        '--output',
        'json',
      ])
      expect(
        JSON.parse(stdout).find((r) => r.stageId === 1).buckets['0-30'].count,
      ).toBe(1)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('tolerates a null pipelines payload (single-pipeline account)', async () => {
    mockApi().get('/api/v2/pipelines').reply(200, { success: true, data: null })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(AgingCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toHaveLength(2)
  })

  it('honors custom --buckets thresholds', async () => {
    mockScope({
      pipelines: [{ id: 1, name: 'P' }],
      openDeals: [{ id: 10, stage_id: 1, value: 100 }],
    })
    mockChangelog(10, [stageRow(0, 1, daysAgo(10))]) // 7-14 with buckets 7,14

    const stdout = await runCmd(AgingCommand, [
      '--buckets',
      '7,14',
      '--output',
      'json',
    ])
    const s1 = JSON.parse(stdout).find((r) => r.stageId === 1)
    expect(s1.buckets['7-14'].count).toBe(1)
  })

  it('rejects a non-numeric --buckets value with exit 64', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'P' }] })

    await expect(
      AgingCommand.run(['--buckets', '30,foo']),
    ).rejects.toMatchObject({ oclif: { exit: 64 } })
  })

  it('rejects a zero or duplicate --buckets threshold with exit 64', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'P' }] })
    await expect(AgingCommand.run(['--buckets', '0,30'])).rejects.toMatchObject(
      { oclif: { exit: 64 } },
    )

    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'P' }] })
    await expect(
      AgingCommand.run(['--buckets', '30,30']),
    ).rejects.toMatchObject({ oclif: { exit: 64 } })
  })

  it('shows an Unknown column and a — p90 cell when dwell is unknown', async () => {
    // The open deal sits in stage 2 but its only transition is INTO stage 1,
    // so its time in stage 2 is unknown. Stage 2 has no completed dwell
    // history either, so its p90 cell renders as "—".
    mockScope({
      pipelines: [{ id: 1, name: 'P' }],
      openDeals: [{ id: 10, stage_id: 2, value: 100 }],
    })
    mockChangelog(10, [stageRow(0, 1, daysAgo(10))])

    const stdout = await runCmd(AgingCommand, ['--output', 'table'])
    expect(stdout).toContain('Unknown')
    expect(stdout).toContain('—')
  })

  it('renders a table even when the pipeline has no stages', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'P' }] })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(AgingCommand, ['--output', 'table'])
    // No rows, no bucket columns — the empty-rows path must not throw and the
    // bucket-label derivation falls back to {} when rows[0] is undefined.
    expect(stdout).toContain('No results found.')
  })

  it('flags deals exceeding the stage p90 in the table', async () => {
    // History: ten deals each dwelled in stage 1 for 1..10 days, then moved to
    // stage 2 (now open there). One open deal still in stage 1 at 40 days
    // exceeds the stage 1 p90 (~9d) and must be flagged.
    const openDeals = [{ id: 1, stage_id: 1, value: 100 }]
    for (let i = 0; i < 10; i++) {
      openDeals.push({ id: 100 + i, stage_id: 2, value: 50 })
    }
    mockScope({ pipelines: [{ id: 1, name: 'P' }], openDeals })
    mockChangelog(1, [stageRow(0, 1, daysAgo(40))])
    for (let i = 0; i < 10; i++) {
      mockChangelog(100 + i, [
        stageRow(1, 2, daysAgo(20 - (i + 1))),
        stageRow(0, 1, daysAgo(20)),
      ])
    }

    const stdout = await runCmd(AgingCommand, ['--output', 'json'])
    const s1 = JSON.parse(stdout).find((r) => r.stageId === 1)
    expect(s1.p90ExceededCount).toBe(1)
    expect(s1.p90Days).toBeGreaterThan(0)
  })

  it('renders the numeric p90 cell in a table when the stage has history', async () => {
    // Same shape as above but table output: the p90 column shows the count and
    // the p90 day figure (the non-null branch), not the "—" placeholder.
    const openDeals = [{ id: 1, stage_id: 1, value: 100 }]
    for (let i = 0; i < 10; i++) {
      openDeals.push({ id: 100 + i, stage_id: 2, value: 50 })
    }
    mockScope({ pipelines: [{ id: 1, name: 'P' }], openDeals })
    mockChangelog(1, [stageRow(0, 1, daysAgo(40))])
    for (let i = 0; i < 10; i++) {
      mockChangelog(100 + i, [
        stageRow(1, 2, daysAgo(20 - (i + 1))),
        stageRow(0, 1, daysAgo(20)),
      ])
    }

    const stdout = await runCmd(AgingCommand, ['--output', 'table'])
    expect(stdout).toMatch(/p90 \d+d/)
  })
})
