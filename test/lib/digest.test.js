import { describe, it, expect } from 'vitest'
import { assembleDigest, digestToReport } from '../../src/lib/digest.js'

const NOW = new Date('2026-06-10T00:00:00Z')
const SINCE = new Date('2026-03-12T00:00:00Z')

const STAGES = [
  { id: 1, name: 'Qualify', order_nr: 0, deal_probability: 40, pipeline_id: 1 },
  { id: 2, name: 'Propose', order_nr: 1, deal_probability: 80, pipeline_id: 1 },
]

const OPEN = [
  {
    id: 1,
    status: 'open',
    stage_id: 1,
    value: 100000,
    currency: 'USD',
    probability: null,
    update_time: '2026-06-09T00:00:00Z',
    expected_close_date: '2026-07-01',
    person_id: 10,
    owner_id: 1,
  },
  {
    id: 2,
    status: 'open',
    stage_id: 2,
    value: 50000,
    currency: 'USD',
    probability: null,
    update_time: '2026-05-01T00:00:00Z', // stale
    expected_close_date: '2026-05-01', // past close
    person_id: null,
    org_id: null, // missing contact
    owner_id: 1,
  },
]
const WON = [
  {
    id: 3,
    status: 'won',
    stage_id: 2,
    value: 40000,
    won_time: '2026-05-01T00:00:00Z',
    add_time: '2026-04-01T00:00:00Z',
  },
]
const LOST = [
  {
    id: 4,
    status: 'lost',
    stage_id: 1,
    value: 0,
    lost_time: '2026-05-10T00:00:00Z',
  },
]
const ACTIVITIES = [
  { id: 1, deal_id: 1, done: false, due_date: '2026-06-20', owner_id: 1 },
]
const TRANSITIONS = [
  {
    dealId: 1,
    stageId: 1,
    rows: [
      {
        field_key: 'stage_id',
        old_value: '1',
        new_value: '2',
        time: '2026-05-02 00:00:00',
      },
    ],
  },
  { dealId: 2, stageId: 2, rows: [] },
]
const GOAL = { goalTarget: 200000, progress: 50000 }

const FETCHED = {
  stages: STAGES,
  open: OPEN,
  won: WON,
  lost: LOST,
  activities: ACTIVITIES,
  transitionsByDeal: TRANSITIONS,
  goal: GOAL,
}

const OPTS = {
  now: NOW,
  since: SINCE,
  pipeline: { id: 1, name: 'Sales' },
  period: '90d',
  commitThreshold: 70,
}

describe('assembleDigest', () => {
  it('fans one fetch into velocity, health, coverage, funnel, forecast, audit', () => {
    const p = assembleDigest(FETCHED, { ...OPTS, deep: false })

    expect(p.deep).toBe(false)
    expect(p.pipeline).toEqual({ id: 1, name: 'Sales' })

    expect(p.velocity.openCount).toBe(2)
    expect(p.velocity.wonCount).toBe(1)

    // coverage from health totals + goal
    expect(p.coverage).not.toBeNull()
    expect(p.coverage.goalTarget).toBe(200000)
    expect(typeof p.coverage.verdict).toBe('string')

    // forecast rows present (USD)
    expect(p.forecast.rows.length).toBeGreaterThan(0)
    expect(p.forecast.totals[0].currency).toBe('USD')

    // approximate funnel when not deep
    expect(p.funnel.exact).toBe(false)
    expect(p.funnel.rows.length).toBe(2)
    expect(p.funnel.won).toBeNull()

    // deal-focused must hygiene checks ran
    const stale = p.audit.find((a) => a.name === 'stale-deals')
    expect(stale.count).toBe(1) // deal 2
    const missing = p.audit.find((a) => a.name === 'missing-fields')
    expect(missing.count).toBe(1) // deal 2 missing person/org

    // mined sections absent unless deep
    expect(p.aging).toBeNull()
    expect(p.slippage).toBeNull()
    expect(p.stageSkips).toBeNull()
  })

  it('adds exact funnel + aging/slippage/stage-skips when deep', () => {
    const p = assembleDigest(FETCHED, { ...OPTS, deep: true })
    expect(p.deep).toBe(true)
    expect(p.funnel.exact).toBe(true)
    expect(typeof p.funnel.won).toBe('number')
    expect(Array.isArray(p.aging)).toBe(true)
    expect(Array.isArray(p.slippage)).toBe(true)
    expect(Array.isArray(p.stageSkips)).toBe(true)
  })

  it('leaves coverage null when no goal is supplied', () => {
    const p = assembleDigest(
      { ...FETCHED, goal: null },
      { ...OPTS, deep: false },
    )
    expect(p.coverage).toBeNull()
  })

  it('omits coverage when open deals span multiple currencies', () => {
    // Goal is single-currency; a coverage ratio over a mixed open pipeline
    // would divide a cross-currency sum by a one-currency quota. A null
    // currency is its own bucket ('(none)'), so USD + none is still mixed.
    const mixed = [OPEN[0], { ...OPEN[1], currency: null }]
    const p = assembleDigest(
      { ...FETCHED, open: mixed },
      { ...OPTS, deep: false },
    )
    expect(p.coverage).toBeNull()
  })
})

describe('digestToReport', () => {
  it('builds a report with title, meta, and the core sections', () => {
    const p = assembleDigest(FETCHED, { ...OPTS, deep: false })
    const report = digestToReport(p, { generatedAt: '2026-06-10T00:00:00Z' })

    expect(report.title).toMatch(/Sales/)
    const metaLabels = report.meta.map((m) => m.label)
    expect(metaLabels).toContain('Generated')
    expect(metaLabels).toContain('Pipeline')
    expect(metaLabels).toContain('Period')

    const headings = report.sections.map((s) => s.heading)
    expect(headings).toContain('Velocity')
    expect(headings).toContain('Coverage')
    expect(headings).toContain('Forecast')
    expect(headings).toContain('Pipeline health')
    expect(headings).toContain('Funnel')
    expect(headings).toContain('Hygiene')
  })

  it('omits the Coverage section when there is no goal', () => {
    const p = assembleDigest(
      { ...FETCHED, goal: null },
      { ...OPTS, deep: false },
    )
    const report = digestToReport(p, { generatedAt: '2026-06-10T00:00:00Z' })
    expect(report.sections.map((s) => s.heading)).not.toContain('Coverage')
  })

  it('adds deep sections (Aging, Slippage, Stage skips) when present', () => {
    const p = assembleDigest(FETCHED, { ...OPTS, deep: true })
    const report = digestToReport(p, { generatedAt: '2026-06-10T00:00:00Z' })
    const headings = report.sections.map((s) => s.heading)
    expect(headings).toContain('Aging')
    expect(headings).toContain('Close-date slippage')
    expect(headings).toContain('Stage skips')
  })

  it('summarizes hygiene as a no-issues line when all checks are clean', () => {
    const clean = assembleDigest(
      {
        ...FETCHED,
        open: [OPEN[0]], // only the healthy deal
        won: [],
        lost: [],
      },
      { ...OPTS, deep: false },
    )
    const report = digestToReport(clean, {
      generatedAt: '2026-06-10T00:00:00Z',
    })
    const hygiene = report.sections.find((s) => s.heading === 'Hygiene')
    expect(hygiene.type).toBe('lines')
    expect(hygiene.lines.join(' ')).toMatch(/no must-fix/i)
  })

  it('renders dashes for null metrics, "covered", and counts skip/backward moves', () => {
    // Hand-built packet exercising the display-formatting null branches and
    // the stage-skip filters with both a skip and a backward move present.
    const packet = {
      pipeline: { id: 1, name: 'P' },
      period: '90d',
      deep: true,
      velocity: {
        openCount: 0,
        wonCount: 0,
        lostCount: 0,
        winRate: null,
        avgWonValue: null,
        avgCycleDays: null,
        velocityPerDay: null,
      },
      health: [],
      coverage: {
        openValue: 0,
        weightedOpen: 0,
        goalTarget: 0,
        progress: 0,
        remaining: 0,
        coverage: null,
        weightedCoverage: null,
        verdict: 'covered',
      },
      forecast: { rows: [], totals: [] },
      funnel: {
        exact: true,
        won: 0,
        rows: [{ stage: 'A', stageId: 1, count: 0, conversionFromPrev: null }],
      },
      audit: [
        { name: 'stale-deals', count: 0, title: 'Stale', severity: 'must' },
      ],
      aging: [
        {
          stage: 'A',
          buckets: { '0-30': { count: 1, value: 10 } },
          p90Days: 12,
          p90ExceededCount: 2,
          unknownCount: 0,
        },
      ],
      slippage: [{ dealId: 1, title: 't', pushCount: 1, netDaysSlipped: 5 }],
      stageSkips: [{ kind: 'skip' }, { kind: 'backward' }],
    }
    const report = digestToReport(packet, { generatedAt: '2026-06-10' })

    const velocity = report.sections.find((s) => s.heading === 'Velocity')
    const winRate = velocity.pairs.find((p) => p.label === 'Win rate')
    expect(winRate.value).toBe('—')
    expect(velocity.pairs.find((p) => p.label === 'Avg won value').value).toBe(
      '—',
    )
    expect(velocity.pairs.find((p) => p.label === 'Velocity / day').value).toBe(
      '—',
    )

    const coverage = report.sections.find((s) => s.heading === 'Coverage')
    expect(coverage.pairs.find((p) => p.label === 'Coverage ratio').value).toBe(
      'covered',
    )

    const aging = report.sections.find((s) => s.heading === 'Aging')
    expect(aging.rows[0].overP90).toBe(2)

    const funnel = report.sections.find((s) => s.heading === 'Funnel')
    expect(funnel.rows[0].conversion).toBe('—')

    const skips = report.sections.find((s) => s.heading === 'Stage skips')
    expect(skips.lines).toEqual(['Forward gate-skips: 1', 'Backward moves: 1'])
  })

  it('renders an empty Aging section when there are no stages', () => {
    const packet = {
      pipeline: { id: 1, name: 'P' },
      period: '90d',
      deep: true,
      velocity: {
        openCount: 0,
        wonCount: 0,
        lostCount: 0,
        winRate: null,
        avgWonValue: null,
        avgCycleDays: null,
        velocityPerDay: null,
      },
      health: [],
      coverage: null,
      forecast: { rows: [], totals: [] },
      funnel: { exact: true, won: 0, rows: [] },
      audit: [],
      aging: [], // truthy but empty → label lookup must fall back to {}
      slippage: [],
      stageSkips: [],
    }
    const report = digestToReport(packet, { generatedAt: '2026-06-10' })
    const aging = report.sections.find((s) => s.heading === 'Aging')
    expect(aging.rows).toEqual([])
    expect(aging.columns.map((c) => c.key)).toEqual(['stage', 'overP90'])
  })

  it('falls back to the pipeline id in the title when the name is missing', () => {
    const p = assembleDigest(FETCHED, {
      ...OPTS,
      pipeline: { id: 7, name: undefined },
      deep: false,
    })
    const report = digestToReport(p, { generatedAt: '2026-06-10T00:00:00Z' })
    expect(report.title).toMatch(/pipeline 7/i)
  })
})
