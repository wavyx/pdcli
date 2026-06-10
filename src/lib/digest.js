import {
  computeVelocity,
  computeHealth,
  computeCoverage,
  computeFunnel,
  computeExactFunnel,
} from './analytics.js'
import { computeForecast } from './forecast.js'
import { computeAging } from './aging.js'
import { computeSlippage } from './slippage.js'
import { computeStageSkips } from './stage-skips.js'
import { runChecks } from './audit.js'

/** The deal-only must-fix hygiene checks a pipeline digest surfaces. */
const MUST_DEAL_CHECKS = [
  'stale-deals',
  'no-next-activity',
  'past-close-date',
  'missing-fields',
]
const DEFAULT_AGING_BUCKETS = [30, 60, 90]
const SLIPPAGE_TOP_N = 10

/**
 * Assemble the Monday-packet digest from ONE pipeline-scoped fetch, fanning the
 * pre-fetched arrays into the existing compute functions. Cheap by default;
 * `deep` adds the changelog-mined sections (exact funnel, aging, slippage,
 * stage skips) which require `transitionsByDeal` from a per-deal mine.
 *
 * @param {{ stages: object[], open: object[], won: object[], lost: object[],
 *   activities: object[], transitionsByDeal: object[],
 *   goal: ({ goalTarget: number, progress: number }|null) }} fetched
 * @param {{ now: Date, since: Date, pipeline: { id: number, name?: string },
 *   period: string, commitThreshold?: number, deep?: boolean }} options
 */
export function assembleDigest(fetched, options) {
  const { stages, open, won, lost, activities, transitionsByDeal, goal } =
    fetched
  const { now, since, pipeline, commitThreshold, deep = false } = options

  const allDeals = [...open, ...won, ...lost]

  const velocity = computeVelocity(allDeals, { since, now })

  const health = computeHealth(open, stages, activities, { now })
  const openValue = health.reduce((sum, r) => sum + r.openValue, 0)
  const weightedOpen = health.reduce((sum, r) => sum + r.weightedValue, 0)

  const coverage = goal
    ? computeCoverage({
        openValue,
        weightedOpen,
        goalTarget: goal.goalTarget,
        progress: goal.progress,
      })
    : null

  const forecast = computeForecast(open, stages, { commitThreshold })

  const audit = runChecks(
    { deals: allDeals, persons: [], organizations: [], activities },
    { now, only: MUST_DEAL_CHECKS },
  )

  let funnel
  if (deep) {
    const ex = computeExactFunnel(transitionsByDeal, stages, {
      pipelineId: pipeline.id,
    })
    funnel = {
      exact: true,
      won: ex.won,
      rows: ex.rows.map((r) => ({
        stage: r.stage,
        stageId: r.stageId,
        count: r.entered,
        conversionFromPrev: r.conversionFromPrev,
      })),
    }
  } else {
    const rows = computeFunnel([...won, ...lost], open, stages, {
      pipelineId: pipeline.id,
    })
    funnel = {
      exact: false,
      won: null,
      rows: rows.map((r) => ({
        stage: r.stage,
        stageId: r.stageId,
        count: r.reached,
        conversionFromPrev: r.conversionFromPrev,
      })),
    }
  }

  return {
    pipeline,
    period: options.period,
    deep,
    velocity,
    health,
    coverage,
    forecast,
    funnel,
    audit,
    aging: deep
      ? computeAging(open, transitionsByDeal, stages, {
          now,
          buckets: DEFAULT_AGING_BUCKETS,
        })
      : null,
    slippage: deep ? computeSlippage(open, transitionsByDeal, {}) : null,
    stageSkips: deep ? computeStageSkips(transitionsByDeal, stages) : null,
  }
}

const money = (x) => (x == null ? '—' : String(Math.round(x)))
const oneDecimal = (x) => (x == null ? '—' : x.toFixed(1))
const percent = (x) => (x == null ? '—' : `${(x * 100).toFixed(0)}%`)

/**
 * Transform an assembled digest packet into the generic report shape consumed
 * by the Markdown/HTML renderers (src/lib/output/report.js).
 *
 * @param {ReturnType<typeof assembleDigest>} packet
 * @param {{ generatedAt: string }} options
 */
export function digestToReport(packet, { generatedAt }) {
  const name = packet.pipeline.name ?? `pipeline ${packet.pipeline.id}`
  const sections = []

  const v = packet.velocity
  sections.push({
    heading: 'Velocity',
    type: 'kv',
    pairs: [
      { label: 'Open deals', value: v.openCount },
      {
        label: 'Win rate',
        value:
          v.winRate == null
            ? '—'
            : `${(v.winRate * 100).toFixed(0)}% (${v.wonCount}W/${v.lostCount}L)`,
      },
      { label: 'Avg won value', value: money(v.avgWonValue) },
      { label: 'Avg cycle (days)', value: oneDecimal(v.avgCycleDays) },
      { label: 'Velocity / day', value: money(v.velocityPerDay) },
    ],
  })

  if (packet.coverage) {
    const c = packet.coverage
    sections.push({
      heading: 'Coverage',
      type: 'kv',
      pairs: [
        { label: 'Open pipeline', value: money(c.openValue) },
        { label: 'Weighted pipeline', value: money(c.weightedOpen) },
        { label: 'Quota', value: money(c.goalTarget) },
        { label: 'Remaining', value: money(c.remaining) },
        {
          label: 'Coverage ratio',
          value: c.coverage == null ? 'covered' : `${c.coverage.toFixed(1)}x`,
        },
        { label: 'Verdict', value: c.verdict },
      ],
    })
  }

  sections.push({
    heading: 'Forecast',
    type: 'table',
    columns: [
      { key: 'currency', header: 'Cur' },
      { key: 'month', header: 'Month' },
      { key: 'commit', header: 'Commit' },
      { key: 'bestCase', header: 'Best case' },
      { key: 'weighted', header: 'Weighted' },
    ],
    rows: packet.forecast.rows.map((r) => ({
      currency: r.currency,
      month: r.month,
      commit: Math.round(r.commit),
      bestCase: Math.round(r.bestCase),
      weighted: Math.round(r.weighted),
    })),
  })

  sections.push({
    heading: 'Pipeline health',
    type: 'table',
    columns: [
      { key: 'stage', header: 'Stage' },
      { key: 'openCount', header: 'Open' },
      { key: 'openValue', header: 'Open value' },
      { key: 'weightedValue', header: 'Weighted' },
      { key: 'staleCount', header: 'Stale' },
      { key: 'noNextActivityCount', header: 'No next activity' },
      { key: 'pastCloseCount', header: 'Past close' },
    ],
    rows: packet.health.map((h) => ({
      ...h,
      openValue: Math.round(h.openValue),
      weightedValue: Math.round(h.weightedValue),
    })),
  })

  sections.push({
    heading: 'Funnel',
    type: 'table',
    columns: [
      { key: 'stage', header: 'Stage' },
      { key: 'count', header: packet.funnel.exact ? 'Entered' : 'Reached' },
      { key: 'conversion', header: 'Conv. from prev' },
    ],
    rows: packet.funnel.rows.map((r) => ({
      stage: r.stage,
      count: r.count,
      conversion: percent(r.conversionFromPrev),
    })),
  })

  const flagged = packet.audit.filter((a) => a.count > 0)
  sections.push({
    heading: 'Hygiene',
    type: 'lines',
    lines:
      flagged.length > 0
        ? flagged.map((a) => `${a.title}: ${a.count}`)
        : ['No must-fix hygiene issues.'],
  })

  if (packet.aging) {
    const labels = Object.keys(packet.aging[0]?.buckets ?? {})
    const columns = [{ key: 'stage', header: 'Stage' }]
    for (const label of labels) columns.push({ key: label, header: label })
    columns.push({ key: 'overP90', header: '> p90' })
    sections.push({
      heading: 'Aging',
      type: 'table',
      columns,
      rows: packet.aging.map((a) => {
        const row = { stage: a.stage }
        for (const label of labels) row[label] = a.buckets[label].count
        row.overP90 = a.p90Days == null ? '—' : a.p90ExceededCount
        return row
      }),
    })
  }

  if (packet.slippage) {
    sections.push({
      heading: 'Close-date slippage',
      type: 'table',
      columns: [
        { key: 'dealId', header: 'Deal' },
        { key: 'title', header: 'Title' },
        { key: 'pushCount', header: 'Pushes' },
        { key: 'netDaysSlipped', header: 'Net days' },
      ],
      rows: packet.slippage.slice(0, SLIPPAGE_TOP_N),
    })
  }

  if (packet.stageSkips) {
    const skips = packet.stageSkips.filter((s) => s.kind === 'skip').length
    const backward = packet.stageSkips.filter(
      (s) => s.kind === 'backward',
    ).length
    sections.push({
      heading: 'Stage skips',
      type: 'lines',
      lines: [`Forward gate-skips: ${skips}`, `Backward moves: ${backward}`],
    })
  }

  return {
    title: `Monday packet — ${name}`,
    meta: [
      { label: 'Generated', value: generatedAt },
      { label: 'Pipeline', value: name },
      { label: 'Period', value: packet.period },
    ],
    sections,
  }
}
