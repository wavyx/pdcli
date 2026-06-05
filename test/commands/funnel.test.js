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

const { default: FunnelCommand } = await import('../../src/commands/funnel.js')
import { runCmd, mockApi } from '../helpers.js'

const STAGES = [
  { id: 1, name: 'Qualified', pipeline_id: 1, order_nr: 0 },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1 },
]

describe('funnel', () => {
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

  function mockCommon({ pipelines }) {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: pipelines })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, {
        success: true,
        data: [{ id: 5, status: 'open', stage_id: 1, value: 100 }],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'won')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            status: 'won',
            stage_id: 2,
            won_time: new Date().toISOString(),
          },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, {
        success: true,
        data: [
          {
            id: 2,
            status: 'lost',
            stage_id: 1,
            lost_time: new Date().toISOString(),
          },
        ],
      })
  }

  it('renders stage-reach conversion for a single-pipeline account', async () => {
    mockCommon({ pipelines: [{ id: 1, name: 'Pipeline' }] })

    const stdout = await runCmd(FunnelCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(2)
    expect(rows[0].reached).toBe(2)
    expect(rows[1].reached).toBe(1)
    expect(rows[1].conversionFromPrev).toBeCloseTo(0.5)
  })

  it('requires --pipeline when several pipelines exist', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
      })

    await expect(FunnelCommand.run([])).rejects.toThrow(/--pipeline/)
  })
})

describe('funnel table output', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('renders percentage cells and blanks for the first stage', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'P' }] })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'won')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            status: 'won',
            stage_id: 2,
            won_time: new Date().toISOString(),
          },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(FunnelCommand, ['--output', 'table'])

    expect(stdout).toContain('100%')
    expect(stdout).toContain('Qualified')
  })
})

describe('funnel with explicit --pipeline and null pipeline data', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  function mockDealsAndStages() {
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    for (const status of ['open', 'won', 'lost']) {
      mockApi()
        .get('/api/v2/deals')
        .query((q) => q.status === status)
        .reply(200, { success: true, data: [] })
    }
  }

  it('skips the pipelines lookup when --pipeline is given', async () => {
    nock.disableNetConnect()
    try {
      nock.enableNetConnect('acme.pipedrive.com')
      mockDealsAndStages()
      const stdout = await runCmd(FunnelCommand, [
        '--pipeline',
        '1',
        '--output',
        'json',
      ])
      expect(JSON.parse(stdout)).toHaveLength(2)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('tolerates a null pipelines payload', async () => {
    mockApi().get('/api/v2/pipelines').reply(200, { success: true, data: null })
    mockDealsAndStages()

    const stdout = await runCmd(FunnelCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toHaveLength(2)
  })
})

describe('funnel --exact (mined stage transitions)', () => {
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

  function mockScope(deals) {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'P' }] })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, {
        success: true,
        data: deals.filter((d) => d.status === 'open'),
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'won')
      .reply(200, {
        success: true,
        data: deals.filter((d) => d.status === 'won'),
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, {
        success: true,
        data: deals.filter((d) => d.status === 'lost'),
      })
  }

  const stageRow = (oldId, newId) => ({
    field_key: 'stage_id',
    old_value: String(oldId),
    new_value: String(newId),
  })

  it('mines per-deal changelog and reports entered counts and conversion', async () => {
    mockScope([
      { id: 10, status: 'won', stage_id: 2 },
      { id: 11, status: 'open', stage_id: 1 },
    ])

    // deal 10: 1 -> 2, then won
    mockApi()
      .get('/api/v1/deals/10/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          stageRow(1, 2),
          { field_key: 'status', old_value: 'open', new_value: 'won' },
        ],
        additional_data: { next_cursor: null },
      })
    // deal 11: created directly in stage 1, no transitions
    mockApi()
      .get('/api/v1/deals/11/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(FunnelCommand, ['--exact', '--output', 'json'])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(2)
    // stage 1 entered by both deals; stage 2 entered only by deal 10
    expect(rows[0]).toMatchObject({ stage: 'Qualified', entered: 2 })
    expect(rows[1]).toMatchObject({ stage: 'Demo', entered: 1 })
    expect(rows[1].conversionFromPrev).toBeCloseTo(0.5)
    expect(rows[0].won).toBe(1)
  })

  it('follows the changelog cursor across multiple pages', async () => {
    mockScope([{ id: 20, status: 'open', stage_id: 2 }])

    // page 1 → next_cursor "c2"; reads next_cursor from FLAT additional_data
    mockApi()
      .get('/api/v1/deals/20/changelog')
      .query((q) => q.cursor === undefined)
      .reply(200, {
        success: true,
        data: [stageRow(1, 2)],
        additional_data: { next_cursor: 'c2' },
      })
    // page 2 → cursor "c2", no more pages
    mockApi()
      .get('/api/v1/deals/20/changelog')
      .query((q) => q.cursor === 'c2')
      .reply(200, {
        success: true,
        data: [stageRow(2, 1)],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(FunnelCommand, ['--exact', '--output', 'json'])
    const rows = JSON.parse(stdout)
    // observed 1->2 (page1) and 2->1 (page2): deal entered both stages
    expect(rows[0].entered).toBe(1)
    expect(rows[1].entered).toBe(1)
  })

  it('warns on stderr with estimated request count when mining over 100 deals', async () => {
    const open = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      status: 'open',
      stage_id: 1,
    }))
    mockScope(open)
    for (const d of open) {
      mockApi()
        .get(`/api/v1/deals/${d.id}/changelog`)
        .query(true)
        .reply(200, {
          success: true,
          data: [],
          additional_data: { next_cursor: null },
        })
    }

    const stderr = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderr.push(String(chunk))
        return true
      })
    try {
      await runCmd(FunnelCommand, ['--exact', '--output', 'json'])
    } finally {
      spy.mockRestore()
    }

    const text = stderr.join('')
    expect(text).toMatch(/101 deals/)
    expect(text).toMatch(/request/i)
  })

  it('renders a table with percentage cells and a blank first-stage conversion', async () => {
    mockScope([{ id: 30, status: 'won', stage_id: 2 }])
    mockApi()
      .get('/api/v1/deals/30/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          stageRow(1, 2),
          { field_key: 'status', old_value: 'open', new_value: 'won' },
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(FunnelCommand, ['--exact', '--output', 'table'])

    expect(stdout).toContain('Qualified')
    expect(stdout).toContain('Demo')
    // Demo enters off Qualified: 1/1 = 100%
    expect(stdout).toContain('100%')
  })

  it('drops the per-row Won column and reports won as a single summary line', async () => {
    mockScope([{ id: 30, status: 'won', stage_id: 2 }])
    mockApi()
      .get('/api/v1/deals/30/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          stageRow(1, 2),
          { field_key: 'status', old_value: 'open', new_value: 'won' },
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(FunnelCommand, ['--exact', '--output', 'table'])

    // The 'Won' column header must no longer be present per-row.
    expect(stdout).not.toContain('Won (')
    expect(stdout).not.toMatch(/│\s*Won\s*│/)
    // The won total is reported once, under the table, as a summary line.
    expect(stdout).toMatch(/Won:\s*1/)
  })

  it("labels the per-row ratio 'Entered vs prev' (entries are non-monotonic)", async () => {
    mockScope([{ id: 30, status: 'won', stage_id: 2 }])
    mockApi()
      .get('/api/v1/deals/30/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [stageRow(1, 2)],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(FunnelCommand, ['--exact', '--output', 'table'])

    // Renamed so it is not misread as funnel conversion (it can exceed 100%).
    expect(stdout).toContain('Entered vs prev')
    expect(stdout).not.toContain('Conv. from prev')
  })

  it('documents that --period scopes only closed deals in --exact mode', () => {
    const desc = FunnelCommand.flags.exact.description
    // Open deals are always mined; --period only narrows won/lost.
    expect(desc).toMatch(/--period/)
    expect(desc).toMatch(/closed/i)
    expect(desc).toMatch(/open deals are always included/i)
  })

  it('does NOT warn when mining 100 or fewer deals', async () => {
    mockScope([{ id: 1, status: 'open', stage_id: 1 }])
    mockApi()
      .get('/api/v1/deals/1/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [],
        additional_data: { next_cursor: null },
      })

    const stderr = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderr.push(String(chunk))
        return true
      })
    try {
      await runCmd(FunnelCommand, ['--exact', '--output', 'json'])
    } finally {
      spy.mockRestore()
    }

    expect(stderr.join('')).not.toMatch(/deals/)
  })

  it('skips deals whose changelog fails to fetch and warns once after mining', async () => {
    // Three deals: deal 40 succeeds, deal 41 returns 404, deal 42 returns 500.
    // The funnel must still render from the survivor, and a single stderr
    // warning must mention the 2 skipped deals.
    mockScope([
      { id: 40, status: 'won', stage_id: 2 },
      { id: 41, status: 'open', stage_id: 1 },
      { id: 42, status: 'open', stage_id: 1 },
    ])
    mockApi()
      .get('/api/v1/deals/40/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [stageRow(1, 2)],
        additional_data: { next_cursor: null },
      })
    mockApi()
      .get('/api/v1/deals/41/changelog')
      .query(true)
      .reply(404, { success: false, error: 'Deal not found' })
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query(true)
      .reply(500, { success: false, error: 'Server error' })

    const stderr = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderr.push(String(chunk))
        return true
      })
    let stdout
    try {
      // --no-retry so the 500 surfaces immediately without backoff sleeps.
      stdout = await runCmd(FunnelCommand, [
        '--exact',
        '--no-retry',
        '--output',
        'json',
      ])
    } finally {
      spy.mockRestore()
    }

    const rows = JSON.parse(stdout)
    // Survivor deal 40 (1 -> 2) entered both stages.
    expect(rows[0].entered).toBe(1)
    expect(rows[1].entered).toBe(1)

    const text = stderr.join('')
    expect(text).toMatch(
      /skipped 2 deal\(s\) whose changelog could not be fetched/,
    )
    // exactly one such warning line
    const warnings = text
      .split('\n')
      .filter((l) => /could not be fetched/.test(l))
    expect(warnings).toHaveLength(1)
  })
})
