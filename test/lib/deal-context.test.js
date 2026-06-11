import { describe, it, expect } from 'vitest'
import { assembleContext } from '../../src/lib/deal-context.js'

const NOW = new Date('2026-06-10T00:00:00Z')

describe('assembleContext', () => {
  it('assembles the bundle and derives risk flags for a neglected deal', () => {
    const deal = {
      id: 1,
      title: 'Acme',
      status: 'open',
      person_id: null,
      org_id: null,
      update_time: '2026-05-01T00:00:00Z', // stale (>14d)
      expected_close_date: '2026-05-01', // past
    }
    const bundle = assembleContext(
      {
        deal,
        person: null,
        org: null,
        activities: [{ id: 1, done: true }],
        notes: [{ id: 1 }],
        products: [{ id: 1 }, { id: 2 }],
        participants: [],
      },
      { now: NOW },
    )
    expect(bundle.deal).toBe(deal)
    expect(bundle.flags).toMatchObject({
      missingContact: true,
      staleOpen: true,
      pastClose: true,
      noCloseDate: false,
      noOpenActivities: true, // the only activity is done
      activityCount: 1,
      noteCount: 1,
      productCount: 2,
      participantCount: 0,
    })
  })

  it('clears the flags for a healthy deal with a contact and an open activity', () => {
    const bundle = assembleContext(
      {
        deal: {
          id: 2,
          status: 'open',
          person_id: 10,
          org_id: null,
          update_time: '2026-06-09T00:00:00Z',
          expected_close_date: '2026-07-01',
        },
        person: { id: 10, name: 'Jane' },
        org: null,
        activities: [{ id: 1, done: false }],
        notes: [],
        products: [],
        participants: [{ id: 1 }],
      },
      { now: NOW },
    )
    expect(bundle.flags).toMatchObject({
      missingContact: false,
      staleOpen: false,
      pastClose: false,
      noCloseDate: false,
      noOpenActivities: false,
      participantCount: 1,
    })
  })

  it('flags a missing close date on an open deal', () => {
    const bundle = assembleContext(
      {
        deal: {
          id: 3,
          status: 'open',
          person_id: 1,
          update_time: '2026-06-09T00:00:00Z',
          expected_close_date: null,
        },
      },
      { now: NOW },
    )
    expect(bundle.flags.noCloseDate).toBe(true)
    // missing slices default to empty
    expect(bundle.activities).toEqual([])
    expect(bundle.flags.activityCount).toBe(0)
    expect(bundle.flags.noOpenActivities).toBe(true)
  })

  it('reports noOpenActivities as null when the activities slice was skipped', () => {
    const bundle = assembleContext(
      {
        deal: { id: 5, status: 'open', person_id: 1 },
        activities: [], // skipped slices arrive empty…
      },
      { now: NOW, activitiesFetched: false }, // …but were not actually fetched
    )
    expect(bundle.flags.noOpenActivities).toBeNull()
  })

  it('does not flag stale/past-close on a closed (won) deal', () => {
    const bundle = assembleContext(
      {
        deal: {
          id: 4,
          status: 'won',
          person_id: 1,
          update_time: '2025-01-01T00:00:00Z',
          expected_close_date: '2025-01-01',
        },
      },
      { now: NOW },
    )
    expect(bundle.flags.staleOpen).toBe(false)
    expect(bundle.flags.pastClose).toBe(false)
    expect(bundle.flags.noCloseDate).toBe(false)
  })
})
