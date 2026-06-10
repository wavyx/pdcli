import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchRevenueGoal,
  normalizeGoalType,
  NON_REVENUE_TYPES,
} from '../../src/lib/goals.js'

const NOW = new Date('2026-06-10T00:00:00Z')

/**
 * Fake client dispatching by path: /api/v1/goals/find -> findResponse,
 * /api/v1/goals/{id}/results -> resultsById[id].
 */
function fakeClient({ findGoals, resultsById = {}, findEnvelope }) {
  return {
    queries: [],
    async get(path, opts) {
      this.queries.push({ path, query: opts?.query })
      if (path === '/api/v1/goals/find') {
        return findEnvelope ?? { success: true, data: { goals: findGoals } }
      }
      const m = /^\/api\/v1\/goals\/(.+)\/results$/.exec(path)
      if (m) {
        return { success: true, data: resultsById[m[1]] ?? {} }
      }
      throw new Error(`unexpected path ${path}`)
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('normalizeGoalType', () => {
  it('lowercases and underscores spaces; handles null', () => {
    expect(normalizeGoalType('Revenue forecast')).toBe('revenue_forecast')
    expect(normalizeGoalType(null)).toBe('')
  })

  it('exposes the non-revenue type set', () => {
    expect(NON_REVENUE_TYPES.has('deals_won')).toBe(true)
  })
})

describe('fetchRevenueGoal', () => {
  it('sums a revenue_forecast goal target and its progress', async () => {
    const client = fakeClient({
      findGoals: [
        {
          id: 'a',
          type: { name: 'revenue_forecast' },
          expected_outcome: { target: 60000, tracking_metric: 'sum' },
        },
      ],
      resultsById: { a: { progress: 25000 } },
    })
    expect(await fetchRevenueGoal(client, { period: '90d', now: NOW })).toEqual(
      {
        goalTarget: 60000,
        progress: 25000,
      },
    )
  })

  it('sends paired period.start/period.end YYYY-MM-DD to find and results', async () => {
    const client = fakeClient({
      findGoals: [
        {
          id: 'a',
          type: { name: 'revenue_forecast' },
          expected_outcome: { target: 1, tracking_metric: 'sum' },
        },
      ],
      resultsById: { a: { progress: 0 } },
    })
    await fetchRevenueGoal(client, { period: '1m', now: NOW })
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    for (const q of client.queries) {
      expect(q.query['period.start']).toMatch(dateRe)
      expect(q.query['period.end']).toBe('2026-06-10')
    }
  })

  it('matches a display-cased "Revenue forecast" type', async () => {
    const client = fakeClient({
      findGoals: [
        {
          id: 'a',
          type: { name: 'Revenue forecast' },
          expected_outcome: { target: 90000, tracking_metric: 'sum' },
        },
      ],
      resultsById: { a: { progress: 0 } },
    })
    expect(
      (await fetchRevenueGoal(client, { period: '90d', now: NOW })).goalTarget,
    ).toBe(90000)
  })

  it('excludes a deals_won sum goal when a revenue_forecast goal exists', async () => {
    const client = fakeClient({
      findGoals: [
        {
          id: 'rev',
          type: { name: 'revenue_forecast' },
          expected_outcome: { target: 100000, tracking_metric: 'sum' },
        },
        {
          id: 'won',
          type: { name: 'deals_won' },
          expected_outcome: { target: 500000, tracking_metric: 'sum' },
        },
      ],
      resultsById: { rev: { progress: 0 } },
    })
    expect(
      (await fetchRevenueGoal(client, { period: '90d', now: NOW })).goalTarget,
    ).toBe(100000)
  })

  it('keeps an unknown sum goal as a fallback when no revenue_forecast exists', async () => {
    const client = fakeClient({
      findGoals: [
        {
          id: 'pv',
          type: { name: 'pipeline_velocity' },
          expected_outcome: { target: 40000, tracking_metric: 'sum' },
        },
      ],
      resultsById: { pv: { progress: 5000 } },
    })
    expect(await fetchRevenueGoal(client, { period: '90d', now: NOW })).toEqual(
      {
        goalTarget: 40000,
        progress: 5000,
      },
    )
  })

  it('last-resorts to a deals_won-only sum goal and writes a stderr note', async () => {
    const writes = []
    vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      writes.push(String(c))
      return true
    })
    const client = fakeClient({
      findGoals: [
        {
          id: 'won',
          type: { name: 'deals_won' },
          expected_outcome: { target: 70000, tracking_metric: 'sum' },
        },
      ],
      resultsById: { won: { progress: 0 } },
    })
    const out = await fetchRevenueGoal(client, { period: '90d', now: NOW })
    expect(out.goalTarget).toBe(70000)
    expect(writes.join('')).toMatch(/deals_won/)
  })

  it('throws exit 64 when no goal matches at all', async () => {
    const client = fakeClient({
      findGoals: [
        {
          id: 'q',
          type: { name: 'deals_won' },
          expected_outcome: { target: 10, tracking_metric: 'quantity' },
        },
      ],
    })
    const err = await fetchRevenueGoal(client, {
      period: '90d',
      now: NOW,
    }).catch((e) => e)
    expect(err.exitCode).toBe(64)
    expect(err.message).toMatch(/no active revenue goal/i)
  })

  it('throws exit 64 when find returns no goals key', async () => {
    const client = fakeClient({ findEnvelope: { success: true, data: {} } })
    const err = await fetchRevenueGoal(client, {
      period: '90d',
      now: NOW,
    }).catch((e) => e)
    expect(err.exitCode).toBe(64)
  })

  it('throws exit 64 when matched goals use multiple currencies', async () => {
    const client = fakeClient({
      findGoals: [
        {
          id: 'usd',
          type: { name: 'revenue_forecast' },
          expected_outcome: {
            target: 60000,
            tracking_metric: 'sum',
            currency_id: 1,
          },
        },
        {
          id: 'eur',
          type: { name: 'revenue_forecast' },
          expected_outcome: {
            target: 40000,
            tracking_metric: 'sum',
            currency_id: 2,
          },
        },
      ],
    })
    const err = await fetchRevenueGoal(client, {
      period: '90d',
      now: NOW,
    }).catch((e) => e)
    expect(err.exitCode).toBe(64)
    expect(err.message).toMatch(/multiple currencies/i)
  })

  it('refuses to mix a real-currency goal with a currency-less one', async () => {
    const client = fakeClient({
      findGoals: [
        {
          id: 'usd',
          type: { name: 'revenue_forecast' },
          expected_outcome: {
            target: 60000,
            tracking_metric: 'sum',
            currency_id: 1,
          },
        },
        {
          id: 'none',
          type: { name: 'revenue_forecast' },
          expected_outcome: { target: 40000, tracking_metric: 'sum' },
        },
      ],
    })
    const err = await fetchRevenueGoal(client, {
      period: '90d',
      now: NOW,
    }).catch((e) => e)
    expect(err.exitCode).toBe(64)
  })

  it('treats a missing target and missing progress as zero (covered verdict upstream)', async () => {
    const client = fakeClient({
      findGoals: [{ id: 'g', expected_outcome: { tracking_metric: 'sum' } }],
      resultsById: { g: {} },
    })
    expect(await fetchRevenueGoal(client, { period: '90d', now: NOW })).toEqual(
      {
        goalTarget: 0,
        progress: 0,
      },
    )
  })
})
