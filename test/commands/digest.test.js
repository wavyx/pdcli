import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: DigestCommand } = await import('../../src/commands/digest.js')
import { runCmd, mockApi } from '../helpers.js'

const DAY = 86_400_000
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString()
const dateAhead = (n) =>
  new Date(Date.now() + n * DAY).toISOString().slice(0, 10)
const dateAgo = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10)

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
const OPEN = [
  {
    id: 10,
    stage_id: 1,
    status: 'open',
    value: 100000,
    currency: 'USD',
    probability: null,
    update_time: daysAgo(1),
    expected_close_date: dateAhead(20),
    person_id: 5,
    owner_id: 1,
  },
  {
    id: 11,
    stage_id: 2,
    status: 'open',
    value: 50000,
    currency: 'USD',
    probability: 90,
    update_time: daysAgo(40), // stale
    expected_close_date: dateAgo(5), // past close
    person_id: null,
    org_id: null, // missing contact
    owner_id: 1,
  },
]
const WON = [
  {
    id: 12,
    stage_id: 2,
    status: 'won',
    value: 40000,
    won_time: daysAgo(10),
    add_time: daysAgo(40),
  },
]
const LOST = [
  { id: 13, stage_id: 1, status: 'lost', value: 0, lost_time: daysAgo(8) },
]
const ACTIVITIES = {
  success: true,
  data: [
    { id: 1, deal_id: 10, done: false, due_date: dateAhead(3), owner_id: 1 },
  ],
}

function mockCore({ open = OPEN } = {}) {
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
    .reply(200, { success: true, data: open })
  mockApi()
    .get('/api/v2/deals')
    .query(
      (q) => q.status === 'won' && q.pipeline_id === '1' && q.updated_since,
    )
    .reply(200, { success: true, data: WON })
  mockApi()
    .get('/api/v2/deals')
    .query(
      (q) => q.status === 'lost' && q.pipeline_id === '1' && q.updated_since,
    )
    .reply(200, { success: true, data: LOST })
  mockApi()
    .get('/api/v2/activities')
    .query((q) => q.done === 'false')
    .reply(200, ACTIVITIES)
}

function mockGoal() {
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
            expected_outcome: { target: 200000, tracking_metric: 'sum' },
          },
        ],
      },
    })
  mockApi()
    .get('/api/v1/goals/g1/results')
    .query(true)
    .reply(200, { success: true, data: { progress: 50000 } })
}

function mockChangelogs() {
  for (const id of [10, 11, 12, 13]) {
    mockApi()
      .get(`/api/v1/deals/${id}/changelog`)
      .query(true)
      .reply(200, { success: true, data: [], additional_data: {} })
  }
}

describe('digest', () => {
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

  it('assembles a structured packet as JSON (cheap default, no mining)', async () => {
    mockCore()
    mockGoal()
    const stdout = await runCmd(DigestCommand, [
      '--pipeline',
      '1',
      '--output',
      'json',
    ])
    const p = JSON.parse(stdout)

    expect(p.pipeline).toEqual({ id: 1, name: 'Sales' })
    expect(p.deep).toBe(false)
    expect(p.velocity.openCount).toBe(2)
    expect(p.coverage.goalTarget).toBe(200000)
    expect(p.forecast.totals[0].currency).toBe('USD')
    expect(p.funnel.exact).toBe(false)
    expect(p.aging).toBeNull()
    const stale = p.audit.find((a) => a.name === 'stale-deals')
    expect(stale.count).toBe(1)
  })

  it('renders a terminal table packet with the section headings', async () => {
    mockCore()
    mockGoal()
    const stdout = await runCmd(DigestCommand, [
      '--pipeline',
      '1',
      '--output',
      'table',
    ])
    expect(stdout).toContain('Monday packet')
    expect(stdout).toContain('Velocity')
    expect(stdout).toContain('Forecast')
    expect(stdout).toContain('Hygiene')
  })

  it('uses --target as the quota and skips the Goals API', async () => {
    mockCore()
    // No goal mocks: hitting the Goals API would 404 via nock.
    const stdout = await runCmd(DigestCommand, [
      '--pipeline',
      '1',
      '--target',
      '300000',
      '--output',
      'json',
    ])
    const p = JSON.parse(stdout)
    expect(p.coverage.goalTarget).toBe(300000)
  })

  it('tolerates a missing revenue goal: coverage null + stderr note', async () => {
    mockCore()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(200, { success: true, data: { goals: [] } })

    const writes = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      writes.push(String(c))
      return true
    })
    let stdout
    try {
      stdout = await runCmd(DigestCommand, [
        '--pipeline',
        '1',
        '--output',
        'json',
      ])
    } finally {
      spy.mockRestore()
    }
    const p = JSON.parse(stdout)
    expect(p.coverage).toBeNull()
    expect(writes.join('')).toMatch(/coverage/i)
  })

  it('mines changelogs and adds deep sections with --deep', async () => {
    mockCore()
    mockGoal()
    mockChangelogs()
    const stdout = await runCmd(DigestCommand, [
      '--pipeline',
      '1',
      '--deep',
      '--output',
      'json',
    ])
    const p = JSON.parse(stdout)
    expect(p.deep).toBe(true)
    expect(p.funnel.exact).toBe(true)
    expect(Array.isArray(p.aging)).toBe(true)
    expect(Array.isArray(p.slippage)).toBe(true)
    expect(Array.isArray(p.stageSkips)).toBe(true)
  })

  it('renders a markdown artifact to stdout with --format md', async () => {
    mockCore()
    mockGoal()
    const stdout = await runCmd(DigestCommand, [
      '--pipeline',
      '1',
      '--format',
      'md',
    ])
    expect(stdout).toContain('# Monday packet — Sales')
    expect(stdout).toContain('## Velocity')
    expect(stdout).toContain('## Forecast')
  })

  it('renders an HTML artifact to stdout with --format html', async () => {
    mockCore()
    mockGoal()
    const stdout = await runCmd(DigestCommand, [
      '--pipeline',
      '1',
      '--format',
      'html',
    ])
    expect(stdout.toLowerCase()).toContain('<!doctype html>')
    expect(stdout).toContain('<h1>Monday packet — Sales</h1>')
  })

  it('writes the artifact to a file with --out', async () => {
    mockCore()
    mockGoal()
    const file = path.join(os.tmpdir(), 'pdcli-digest-test.md')
    await rm(file, { force: true })
    const stdout = await runCmd(DigestCommand, [
      '--pipeline',
      '1',
      '--format',
      'md',
      '--out',
      file,
    ])
    expect(stdout).toMatch(/Wrote md digest to/)
    const written = await readFile(file, 'utf8')
    expect(written).toContain('# Monday packet — Sales')
    await rm(file, { force: true })
  })

  it('rethrows a non-usage Goals API error instead of swallowing it', async () => {
    mockCore()
    mockApi()
      .get('/api/v1/goals/find')
      .query(true)
      .reply(401, { success: false, error: 'unauthorized' })

    const err = await DigestCommand.run(['--pipeline', '1']).catch((e) => e)
    // 401 → exit 77, not the 64 "no goal" case, so it must propagate.
    expect(err.exitCode ?? err.oclif?.exit).toBe(77)
  })

  it('omits coverage and notes when the open pipeline spans currencies', async () => {
    const mixed = [
      OPEN[0], // USD
      { ...OPEN[1], currency: 'EUR' }, // EUR → mixed
    ]
    mockCore({ open: mixed })
    mockGoal()

    const writes = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      writes.push(String(c))
      return true
    })
    let stdout
    try {
      stdout = await runCmd(DigestCommand, [
        '--pipeline',
        '1',
        '--output',
        'json',
      ])
    } finally {
      spy.mockRestore()
    }
    const p = JSON.parse(stdout)
    expect(p.coverage).toBeNull()
    expect(writes.join('')).toMatch(/multiple currencies/i)
  })

  it('errors with exit 64 when --jq is combined with --format', async () => {
    const err = await DigestCommand.run([
      '--pipeline',
      '1',
      '--format',
      'md',
      '--jq',
      '.coverage',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--format/)
  })

  it('errors with exit 64 when an explicit --output is combined with --format', async () => {
    // An explicit --output routes the error through the JSON envelope, so the
    // thrown EEXIT carries only the code; assert the message on the envelope.
    const writes = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      writes.push(String(c))
      return true
    })
    let err
    try {
      err = await DigestCommand.run([
        '--pipeline',
        '1',
        '--format',
        'md',
        '--output',
        'json',
      ]).catch((e) => e)
    } finally {
      spy.mockRestore()
    }
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(writes.join('')).toMatch(/--format/)
  })

  it('routes --jq through the whole packet even with --output table', async () => {
    mockCore()
    mockGoal()
    // --output table + --jq must NOT fragment per-section; jq sees the packet.
    const stdout = await runCmd(DigestCommand, [
      '--pipeline',
      '1',
      '--output',
      'table',
      '--jq',
      '.pipeline.name',
    ])
    expect(stdout.trim()).toBe('"Sales"')
  })

  it('errors with exit 64 when --out is given without --format', async () => {
    const err = await DigestCommand.run([
      '--pipeline',
      '1',
      '--out',
      'x.md',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--format/)
  })

  it('errors with exit 64 when several pipelines exist and none chosen', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'Sales' },
          { id: 2, name: 'Partners' },
        ],
      })
    const err = await DigestCommand.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--pipeline/)
  })
})
