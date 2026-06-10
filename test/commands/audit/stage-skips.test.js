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

const { default: AuditStageSkipsCommand } =
  await import('../../../src/commands/audit/stage-skips.js')
import { runCmd, mockApi } from '../../helpers.js'

const STAGES = [
  { id: 1, name: 'Qualified', pipeline_id: 1, order_nr: 0 },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1 },
  { id: 3, name: 'Proposal', pipeline_id: 1, order_nr: 2 },
]

const stageRow = (oldId, newId, actor) => ({
  field_key: 'stage_id',
  old_value: String(oldId),
  new_value: String(newId),
  time: '2026-01-01 10:00:00',
  actor_user_id: actor,
})

describe('audit stage-skips', () => {
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

  function mockScope(deals, { pipelines = [{ id: 1, name: 'P' }] } = {}) {
    if (pipelines) {
      mockApi()
        .get('/api/v2/pipelines')
        .reply(200, { success: true, data: pipelines })
    }
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    for (const status of ['open', 'won', 'lost']) {
      mockApi()
        .get('/api/v2/deals')
        .query((q) => q.status === status)
        .reply(200, {
          success: true,
          data: deals.filter((d) => d.status === status),
        })
    }
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

  it('reports a forward skip with the skipped gate named (json)', async () => {
    mockScope([{ id: 10, status: 'open', stage_id: 3 }])
    mockChangelog(10, [stageRow(1, 3, 7)])

    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'json'])
    const findings = JSON.parse(stdout)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      dealId: 10,
      kind: 'skip',
      skipped: ['Demo'],
      actor_user_id: 7,
    })
  })

  it('reports a backward move', async () => {
    mockScope([{ id: 11, status: 'open', stage_id: 2 }])
    mockChangelog(11, [stageRow(3, 2, 8)])

    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'json'])
    const findings = JSON.parse(stdout)

    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('backward')
  })

  it('emits no findings (empty array) for a clean +1 advance', async () => {
    mockScope([{ id: 12, status: 'open', stage_id: 2 }])
    mockChangelog(12, [stageRow(1, 2, 1)])

    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual([])
  })

  it('renders a table with deal, kind, from->to, skipped gates and actor', async () => {
    mockScope([{ id: 13, status: 'open', stage_id: 3 }])
    mockChangelog(13, [stageRow(1, 3, 7)])

    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'table'])

    expect(stdout).toContain('13')
    expect(stdout).toContain('skip')
    expect(stdout).toContain('Qualified')
    expect(stdout).toContain('Proposal')
    expect(stdout).toContain('Demo') // skipped gate
  })

  it('mines all deal states (open + won + lost) for full stage history', async () => {
    mockScope([
      { id: 20, status: 'open', stage_id: 3 },
      { id: 21, status: 'won', stage_id: 3 },
      { id: 22, status: 'lost', stage_id: 2 },
    ])
    mockChangelog(20, [stageRow(1, 3, 1)]) // skip
    mockChangelog(21, [stageRow(1, 3, 1)]) // skip
    mockChangelog(22, [stageRow(3, 2, 1)]) // backward

    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'json'])
    const findings = JSON.parse(stdout)

    expect(findings.map((f) => f.dealId).sort()).toEqual([20, 21, 22])
  })

  it('requires --pipeline when several pipelines exist (exit 64)', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
      })

    let caught
    try {
      await AuditStageSkipsCommand.run([])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.message).toMatch(/--pipeline/)
    expect(caught.oclif?.exit ?? caught.exitCode).toBe(64)
  })

  it('skips the pipelines lookup when --pipeline is given', async () => {
    nock.disableNetConnect()
    try {
      nock.enableNetConnect('acme.pipedrive.com')
      mockScope([{ id: 30, status: 'open', stage_id: 1 }], { pipelines: null })
      mockChangelog(30, [])

      const stdout = await runCmd(AuditStageSkipsCommand, [
        '--pipeline',
        '1',
        '--output',
        'json',
      ])
      expect(JSON.parse(stdout)).toEqual([])
    } finally {
      nock.enableNetConnect()
    }
  })

  it('tolerates a null pipelines payload', async () => {
    mockApi().get('/api/v2/pipelines').reply(200, { success: true, data: null })
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

    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual([])
  })

  it('exits 0 even when findings exist (informational, not a gate)', async () => {
    mockScope([{ id: 40, status: 'open', stage_id: 3 }])
    mockChangelog(40, [stageRow(1, 3, 7)])

    // runCmd rethrows on any thrown error; a clean return means exit 0.
    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toHaveLength(1)
  })

  it('renders a blank Actor cell when the transition has no actor', async () => {
    mockScope([{ id: 45, status: 'open', stage_id: 3 }])
    // changelog row with no actor_user_id field
    mockChangelog(45, [
      {
        field_key: 'stage_id',
        old_value: '1',
        new_value: '3',
        time: '2026-01-01 10:00:00',
      },
    ])

    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'table'])
    expect(stdout).toContain('skip')
    expect(stdout).toContain('Demo') // skipped gate still named
  })

  it('prints a friendly note for an empty table instead of bare headers', async () => {
    mockScope([{ id: 50, status: 'open', stage_id: 2 }])
    mockChangelog(50, [stageRow(1, 2, 1)]) // clean, no findings

    const stdout = await runCmd(AuditStageSkipsCommand, ['--output', 'table'])
    expect(stdout).toMatch(/no.*skip/i)
  })
})
