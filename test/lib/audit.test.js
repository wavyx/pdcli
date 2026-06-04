import { describe, it, expect } from 'vitest'
import { runChecks, AUDIT_CHECKS } from '../../src/lib/audit.js'

const NOW = new Date('2026-06-04T12:00:00Z')
const DAY = 86_400_000

function daysAgo(n) {
  return new Date(NOW.getTime() - n * DAY).toISOString()
}

function dataset(overrides = {}) {
  return {
    deals: [],
    persons: [],
    organizations: [],
    activities: [],
    ...overrides,
  }
}

function byName(results, name) {
  return results.find((r) => r.name === name)
}

describe('runChecks', () => {
  it('exposes the catalog of checks with severities', () => {
    expect(AUDIT_CHECKS.length).toBeGreaterThanOrEqual(11)
    expect(
      AUDIT_CHECKS.every((c) => ['must', 'should'].includes(c.severity)),
    ).toBe(true)
  })

  it('flags stale open deals (>14 days without update)', () => {
    const results = runChecks(
      dataset({
        deals: [
          { id: 1, status: 'open', update_time: daysAgo(20) },
          { id: 2, status: 'open', update_time: daysAgo(2) },
          {
            id: 3,
            status: 'won',
            update_time: daysAgo(60),
            won_time: daysAgo(60),
          },
        ],
      }),
      { now: NOW },
    )
    const check = byName(results, 'stale-deals')
    expect(check.count).toBe(1)
    expect(check.items[0]).toMatchObject({ id: 1 })
  })

  it('flags open deals without a future open activity', () => {
    const results = runChecks(
      dataset({
        deals: [
          { id: 1, status: 'open', update_time: daysAgo(1) },
          { id: 2, status: 'open', update_time: daysAgo(1) },
        ],
        activities: [
          { id: 10, deal_id: 1, done: false, due_date: '2026-06-10' },
          { id: 11, deal_id: 2, done: false, due_date: '2026-05-01' }, // overdue
        ],
      }),
      { now: NOW },
    )
    const check = byName(results, 'no-next-activity')
    expect(check.count).toBe(1)
    expect(check.items[0].id).toBe(2)
  })

  it('flags open deals past their expected close date', () => {
    const results = runChecks(
      dataset({
        deals: [
          {
            id: 1,
            status: 'open',
            update_time: daysAgo(1),
            expected_close_date: '2026-05-01',
          },
          {
            id: 2,
            status: 'open',
            update_time: daysAgo(1),
            expected_close_date: '2026-08-01',
          },
          {
            id: 3,
            status: 'open',
            update_time: daysAgo(1),
            expected_close_date: null,
          },
        ],
      }),
      { now: NOW },
    )
    expect(byName(results, 'past-close-date').count).toBe(1)
  })

  it('flags open deals missing critical fields', () => {
    const results = runChecks(
      dataset({
        deals: [
          {
            id: 1,
            status: 'open',
            update_time: daysAgo(1),
            owner_id: null,
            person_id: 1,
            org_id: null,
            value: 100,
            currency: 'EUR',
          },
          {
            id: 2,
            status: 'open',
            update_time: daysAgo(1),
            owner_id: 9,
            person_id: null,
            org_id: null,
            value: 100,
            currency: 'EUR',
          },
          {
            id: 3,
            status: 'open',
            update_time: daysAgo(1),
            owner_id: 9,
            person_id: 1,
            org_id: 1,
            value: null,
            currency: 'EUR',
          },
          {
            id: 4,
            status: 'open',
            update_time: daysAgo(1),
            owner_id: 9,
            person_id: 1,
            org_id: 1,
            value: 100,
            currency: 'EUR',
          },
        ],
      }),
      { now: NOW },
    )
    const check = byName(results, 'missing-fields')
    expect(check.count).toBe(3)
    const issues = Object.fromEntries(check.items.map((i) => [i.id, i.missing]))
    expect(issues[1]).toContain('owner')
    expect(issues[2]).toContain('person/org')
    expect(issues[3]).toContain('value')
  })

  it('flags ancient open deals beyond 2× the won cycle (fallback 168d)', () => {
    const results = runChecks(
      dataset({
        deals: [
          // won cycle: 20 days → threshold 40d
          {
            id: 1,
            status: 'won',
            add_time: daysAgo(120),
            won_time: daysAgo(100),
          },
          {
            id: 2,
            status: 'open',
            update_time: daysAgo(1),
            add_time: daysAgo(50),
          },
          {
            id: 3,
            status: 'open',
            update_time: daysAgo(1),
            add_time: daysAgo(10),
          },
        ],
      }),
      { now: NOW },
    )
    const check = byName(results, 'ancient-deals')
    expect(check.count).toBe(1)
    expect(check.items[0].id).toBe(2)
  })

  it('uses the 168d fallback when no won deals exist', () => {
    const results = runChecks(
      dataset({
        deals: [
          {
            id: 1,
            status: 'open',
            update_time: daysAgo(1),
            add_time: daysAgo(200),
          },
          {
            id: 2,
            status: 'open',
            update_time: daysAgo(1),
            add_time: daysAgo(100),
          },
        ],
      }),
      { now: NOW },
    )
    expect(byName(results, 'ancient-deals').count).toBe(1)
  })

  it('flags closed deals missing their close timestamp', () => {
    const results = runChecks(
      dataset({
        deals: [
          { id: 1, status: 'won', won_time: null, add_time: daysAgo(5) },
          { id: 2, status: 'lost', lost_time: null, add_time: daysAgo(5) },
          { id: 3, status: 'won', won_time: daysAgo(1), add_time: daysAgo(5) },
        ],
      }),
      { now: NOW },
    )
    expect(byName(results, 'missing-close-time').count).toBe(2)
  })

  it('clusters duplicate persons sharing a normalized email', () => {
    const results = runChecks(
      dataset({
        persons: [
          { id: 1, name: 'A', emails: [{ value: 'Dup@Acme.com ' }] },
          { id: 2, name: 'B', emails: [{ value: 'dup@acme.com' }] },
          { id: 3, name: 'C', emails: [{ value: 'unique@acme.com' }] },
        ],
      }),
      { now: NOW },
    )
    const check = byName(results, 'duplicate-persons')
    expect(check.count).toBe(1)
    expect(check.items[0]).toMatchObject({
      email: 'dup@acme.com',
      ids: [1, 2],
    })
  })

  it('flags persons with neither email nor phone', () => {
    const results = runChecks(
      dataset({
        persons: [
          { id: 1, name: 'NoContact', emails: [], phones: [] },
          { id: 2, name: 'HasPhone', emails: [], phones: [{ value: '+32' }] },
        ],
      }),
      { now: NOW },
    )
    const check = byName(results, 'uncontactable-persons')
    expect(check.count).toBe(1)
    expect(check.items[0].id).toBe(1)
  })

  it('clusters duplicate organizations by normalized name', () => {
    const results = runChecks(
      dataset({
        organizations: [
          { id: 1, name: 'Acme Inc.' },
          { id: 2, name: 'ACME inc' },
          { id: 3, name: 'Globex Ltd' },
        ],
      }),
      { now: NOW },
    )
    const check = byName(results, 'duplicate-orgs')
    expect(check.count).toBe(1)
    expect(check.items[0].ids).toEqual([1, 2])
  })

  it('groups overdue activities by owner', () => {
    const results = runChecks(
      dataset({
        activities: [
          { id: 1, done: false, due_date: '2026-05-01', owner_id: 9 },
          { id: 2, done: false, due_date: '2026-05-02', owner_id: 9 },
          { id: 3, done: false, due_date: '2026-07-01', owner_id: 9 },
          { id: 4, done: true, due_date: '2026-05-01', owner_id: 9 },
        ],
      }),
      { now: NOW },
    )
    const check = byName(results, 'overdue-activities')
    expect(check.count).toBe(2)
    expect(check.items[0]).toMatchObject({ owner_id: 9, overdue: 2 })
  })

  it('flags deals with a value but no currency', () => {
    const results = runChecks(
      dataset({
        deals: [
          {
            id: 1,
            status: 'open',
            update_time: daysAgo(1),
            value: 100,
            currency: null,
          },
          {
            id: 2,
            status: 'open',
            update_time: daysAgo(1),
            value: 100,
            currency: 'EUR',
          },
        ],
      }),
      { now: NOW },
    )
    expect(byName(results, 'currency-missing').count).toBe(1)
  })

  it('filters to requested check names', () => {
    const results = runChecks(dataset(), { now: NOW, only: ['stale-deals'] })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('stale-deals')
  })
})
