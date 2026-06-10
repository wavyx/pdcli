import { describe, it, expect } from 'vitest'
import { computeScorecard } from '../../src/lib/scorecard.js'

const NOW = new Date('2026-06-10T00:00:00Z')
const SINCE = new Date('2026-03-12T00:00:00Z')

const USERS = [
  { id: 1, name: 'Alice', email: 'a@x.com', active_flag: true },
  { id: 2, name: 'Bob', email: 'b@x.com', active_flag: false },
]

const DEALS = [
  // Alice (owner 1)
  {
    id: 1,
    owner_id: 1,
    status: 'open',
    value: 50000,
    update_time: '2026-06-09T00:00:00Z',
    expected_close_date: '2026-07-01',
    person_id: 10,
  },
  {
    id: 2,
    owner_id: 1,
    status: 'open',
    value: 30000,
    update_time: '2026-05-01T00:00:00Z', // stale (>14d)
    expected_close_date: '2026-05-15', // past
    person_id: 11,
  },
  {
    id: 3,
    owner_id: 1,
    status: 'won',
    value: 40000,
    won_time: '2026-05-01T00:00:00Z',
    add_time: '2026-04-01T00:00:00Z', // cycle 30d
  },
  {
    id: 4,
    owner_id: 1,
    status: 'lost',
    value: 0,
    lost_time: '2026-05-10T00:00:00Z',
  },
  // Bob (owner 2, deactivated)
  {
    id: 5,
    owner_id: 2,
    status: 'open',
    value: 20000,
    update_time: '2026-06-01T00:00:00Z',
    expected_close_date: null, // no close date
    person_id: null,
    org_id: null, // missing contact
  },
  {
    id: 6,
    owner_id: 2,
    status: 'won',
    value: 10000,
    won_time: '2026-04-01T00:00:00Z',
    add_time: '2026-03-20T00:00:00Z', // cycle 12d
  },
  // Owner 3 — not present in USERS
  {
    id: 7,
    owner_id: 3,
    status: 'open',
    value: 5000,
    update_time: '2026-06-08T00:00:00Z',
    expected_close_date: '2026-08-01',
    person_id: 12,
  },
  // Unassigned (null owner)
  {
    id: 8,
    owner_id: null,
    status: 'open',
    value: 1000,
    update_time: '2026-06-08T00:00:00Z',
    expected_close_date: '2026-08-01',
    person_id: 13,
  },
]

describe('computeScorecard', () => {
  it('produces one row per owner with resolved name and active flag', () => {
    const rows = computeScorecard(DEALS, USERS, { since: SINCE, now: NOW })
    const byId = new Map(rows.map((r) => [r.ownerId, r]))

    expect(byId.get(1).ownerName).toBe('Alice')
    expect(byId.get(1).active).toBe(true)
    expect(byId.get(2).ownerName).toBe('Bob')
    expect(byId.get(2).active).toBe(false)
    // owner 3 has no matching user
    expect(byId.get(3).ownerName).toBe('#3')
    expect(byId.get(3).active).toBeNull()
    // null owner bucketed as Unassigned
    expect(byId.get(null).ownerName).toBe('Unassigned')
    expect(byId.get(null).active).toBeNull()
  })

  it('computes per-owner velocity (win rate, cycle, won value)', () => {
    const rows = computeScorecard(DEALS, USERS, { since: SINCE, now: NOW })
    const alice = rows.find((r) => r.ownerId === 1)
    expect(alice.openCount).toBe(2)
    expect(alice.wonCount).toBe(1)
    expect(alice.lostCount).toBe(1)
    expect(alice.winRate).toBe(0.5)
    expect(alice.avgWonValue).toBe(40000)
    expect(alice.avgCycleDays).toBe(30)

    const bob = rows.find((r) => r.ownerId === 2)
    expect(bob.winRate).toBe(1) // 1 won, 0 lost
    expect(bob.avgCycleDays).toBe(12)
  })

  it('counts per-owner hygiene from open deals only', () => {
    const rows = computeScorecard(DEALS, USERS, { since: SINCE, now: NOW })
    const alice = rows.find((r) => r.ownerId === 1)
    expect(alice.staleOpen).toBe(1) // deal 2
    expect(alice.pastClose).toBe(1) // deal 2
    expect(alice.noCloseDate).toBe(0)
    expect(alice.missingContact).toBe(0)

    const bob = rows.find((r) => r.ownerId === 2)
    expect(bob.noCloseDate).toBe(1) // deal 5
    expect(bob.missingContact).toBe(1) // deal 5
    expect(bob.staleOpen).toBe(0)
  })

  it('sorts by velocity per day descending, null-velocity owners last', () => {
    const rows = computeScorecard(DEALS, USERS, { since: SINCE, now: NOW })
    // Alice ~1333/day > Bob ~833/day; owners 3 & null have null velocity.
    expect(rows[0].ownerId).toBe(1)
    expect(rows[1].ownerId).toBe(2)
    expect(rows.slice(2).every((r) => r.velocityPerDay == null)).toBe(true)
  })

  it('orders two null-velocity owners alphabetically by name', () => {
    // Both owners have only open deals → null velocity → equal sort key,
    // so they fall through to the name tie-break.
    const users = [
      { id: 1, name: 'Zoe', active_flag: true },
      { id: 2, name: 'Ann', active_flag: true },
    ]
    const deals = [
      {
        id: 1,
        owner_id: 1,
        status: 'open',
        value: 1,
        update_time: '2026-06-09T00:00:00Z',
        person_id: 1,
      },
      {
        id: 2,
        owner_id: 2,
        status: 'open',
        value: 1,
        update_time: '2026-06-09T00:00:00Z',
        person_id: 2,
      },
    ]
    const rows = computeScorecard(deals, users, { since: SINCE, now: NOW })
    expect(rows.map((r) => r.ownerName)).toEqual(['Ann', 'Zoe'])
  })

  it('returns no rows for no deals', () => {
    expect(computeScorecard([], USERS, { since: SINCE, now: NOW })).toEqual([])
  })

  it('filters to a single owner when ownerId is given', () => {
    const rows = computeScorecard(DEALS, USERS, {
      since: SINCE,
      now: NOW,
      ownerId: 2,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].ownerId).toBe(2)
  })
})
