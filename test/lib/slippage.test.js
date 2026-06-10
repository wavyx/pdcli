import { describe, it, expect } from 'vitest'
import { computeSlippage } from '../../src/lib/slippage.js'

/**
 * Build a transitionsByDeal entry. Rows are NEWEST-FIRST (the changelog's
 * native order), mirroring what mineMany returns. Each row carries
 * { field_key, old_value, new_value, time }.
 */
function entry(dealId, rows) {
  return { dealId, stageId: 1, rows }
}

describe('computeSlippage', () => {
  it('counts a single forward push and reports net days slipped', () => {
    const deals = [
      {
        id: 1,
        title: 'Acme',
        owner_id: 7,
        expected_close_date: '2026-07-10',
      },
    ]
    const transitionsByDeal = [
      entry(1, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-10',
          time: '2026-06-05T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      dealId: 1,
      title: 'Acme',
      ownerId: 7,
      pushCount: 1,
      netDaysSlipped: 9,
      originalCloseDate: '2026-07-01',
      currentCloseDate: '2026-07-10',
    })
  })

  it('accumulates multiple forward pushes into the net slip', () => {
    const deals = [
      { id: 2, title: 'Beta', owner_id: 3, expected_close_date: '2026-08-01' },
    ]
    // Newest-first: 07-10 -> 08-01, then 07-01 -> 07-10
    const transitionsByDeal = [
      entry(2, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-10',
          new_value: '2026-08-01',
          time: '2026-06-20T10:00:00Z',
        },
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-10',
          time: '2026-06-05T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})

    expect(rows[0].pushCount).toBe(2)
    // 07-01 -> 07-10 = 9 days; 07-10 -> 08-01 = 22 days; total 31
    expect(rows[0].netDaysSlipped).toBe(31)
    expect(rows[0].originalCloseDate).toBe('2026-07-01')
    expect(rows[0].currentCloseDate).toBe('2026-08-01')
  })

  it('does not let a pull-in subtract net slip below the forward sum', () => {
    const deals = [
      { id: 3, title: 'Gamma', owner_id: 1, expected_close_date: '2026-07-05' },
    ]
    // Newest-first: 07-20 -> 07-05 (pull-in), then 07-01 -> 07-20 (push)
    const transitionsByDeal = [
      entry(3, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-20',
          new_value: '2026-07-05',
          time: '2026-06-20T10:00:00Z',
        },
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-20',
          time: '2026-06-05T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})

    // Only the forward push counts toward pushCount and net slip; the pull-in
    // is observed but does not reduce the net below the forward delta sum.
    expect(rows[0].pushCount).toBe(1)
    expect(rows[0].netDaysSlipped).toBe(19) // 07-01 -> 07-20
    expect(rows[0].originalCloseDate).toBe('2026-07-01')
    expect(rows[0].currentCloseDate).toBe('2026-07-05')
  })

  it('treats a null -> date as the initial set, not a push', () => {
    const deals = [
      { id: 4, title: 'Delta', owner_id: 2, expected_close_date: '2026-07-15' },
    ]
    // Newest-first: 07-01 -> 07-15 (push), then null -> 07-01 (initial set)
    const transitionsByDeal = [
      entry(4, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-15',
          time: '2026-06-10T10:00:00Z',
        },
        {
          field_key: 'expected_close_date',
          old_value: null,
          new_value: '2026-07-01',
          time: '2026-06-01T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})

    expect(rows[0].pushCount).toBe(1)
    expect(rows[0].netDaysSlipped).toBe(14) // 07-01 -> 07-15
    // Original close date is the first date ever set, not null.
    expect(rows[0].originalCloseDate).toBe('2026-07-01')
    expect(rows[0].currentCloseDate).toBe('2026-07-15')
  })

  it('handles a date -> null (cleared) without counting it as a push', () => {
    const deals = [
      { id: 5, title: 'Epsilon', owner_id: 9, expected_close_date: null },
    ]
    // Newest-first: 07-01 -> null (cleared), then null -> 07-01 (initial set)
    const transitionsByDeal = [
      entry(5, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '',
          time: '2026-06-10T10:00:00Z',
        },
        {
          field_key: 'expected_close_date',
          old_value: '',
          new_value: '2026-07-01',
          time: '2026-06-01T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, { minPushes: 0 })

    // No forward push: clearing is not a slip.
    expect(rows).toHaveLength(1)
    expect(rows[0].pushCount).toBe(0)
    expect(rows[0].netDaysSlipped).toBe(0)
  })

  it('filters out deals below minPushes (default 1)', () => {
    const deals = [
      {
        id: 6,
        title: 'Zeta',
        owner_id: 4,
        expected_close_date: '2026-07-01',
      },
      {
        id: 7,
        title: 'Eta',
        owner_id: 5,
        expected_close_date: '2026-08-10',
      },
    ]
    const transitionsByDeal = [
      // Zeta: no expected_close_date changes at all -> 0 pushes -> filtered out
      entry(6, [
        {
          field_key: 'stage_id',
          old_value: '1',
          new_value: '2',
          time: '2026-06-01T10:00:00Z',
        },
      ]),
      // Eta: one push
      entry(7, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-08-01',
          new_value: '2026-08-10',
          time: '2026-06-05T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})

    expect(rows).toHaveLength(1)
    expect(rows[0].dealId).toBe(7)
  })

  it('respects an explicit minPushes threshold', () => {
    const deals = [
      { id: 8, title: 'A', owner_id: 1, expected_close_date: '2026-07-10' },
      { id: 9, title: 'B', owner_id: 1, expected_close_date: '2026-08-01' },
    ]
    const transitionsByDeal = [
      // A: one push only
      entry(8, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-10',
          time: '2026-06-05T10:00:00Z',
        },
      ]),
      // B: two pushes
      entry(9, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-10',
          new_value: '2026-08-01',
          time: '2026-06-20T10:00:00Z',
        },
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-10',
          time: '2026-06-05T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, { minPushes: 2 })

    expect(rows).toHaveLength(1)
    expect(rows[0].dealId).toBe(9)
  })

  it('sorts rows by net days slipped descending', () => {
    const deals = [
      {
        id: 10,
        title: 'Small',
        owner_id: 1,
        expected_close_date: '2026-07-05',
      },
      { id: 11, title: 'Big', owner_id: 1, expected_close_date: '2026-09-01' },
    ]
    const transitionsByDeal = [
      // Small: 4-day push
      entry(10, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-05',
          time: '2026-06-05T10:00:00Z',
        },
      ]),
      // Big: 62-day push
      entry(11, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-09-01',
          time: '2026-06-05T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})

    expect(rows.map((r) => r.dealId)).toEqual([11, 10])
  })

  it('skips an unparseable date transition', () => {
    const deals = [
      { id: 12, title: 'Bad', owner_id: 1, expected_close_date: '2026-07-20' },
    ]
    // Newest-first: 07-01 -> 07-20 (valid push), then garbage -> 07-01 (skip)
    const transitionsByDeal = [
      entry(12, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-20',
          time: '2026-06-10T10:00:00Z',
        },
        {
          field_key: 'expected_close_date',
          old_value: 'not-a-date',
          new_value: '2026-07-01',
          time: '2026-06-01T10:00:00Z',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})

    // The garbage->07-01 transition is skipped; only 07-01 -> 07-20 counts.
    expect(rows[0].pushCount).toBe(1)
    expect(rows[0].netDaysSlipped).toBe(19)
    expect(rows[0].originalCloseDate).toBe('2026-07-01')
  })

  it('sorts deterministically when transition rows lack a time field', () => {
    const deals = [
      {
        id: 14,
        title: 'NoTime',
        owner_id: 1,
        expected_close_date: '2026-07-20',
      },
    ]
    // Neither row carries `time` — the sort falls back to empty strings on
    // both sides. Each transition is self-contained, so the push still counts.
    const transitionsByDeal = [
      entry(14, [
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-10',
          new_value: '2026-07-20',
        },
        {
          field_key: 'expected_close_date',
          old_value: '2026-07-01',
          new_value: '2026-07-10',
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})

    expect(rows[0].pushCount).toBe(2)
    expect(rows[0].netDaysSlipped).toBe(19) // 9 + 10
  })

  it('tolerates a deal with no mined changelog entry', () => {
    const deals = [
      {
        id: 13,
        title: 'Orphan',
        owner_id: 1,
        expected_close_date: '2026-07-01',
      },
    ]
    // mineMany skipped this deal (ApiError) -> no transitions entry for it.
    const rows = computeSlippage(deals, [], {})
    expect(rows).toHaveLength(0)
  })

  it('derives the original close date from the chain root on same-second rows', () => {
    // Three close-date sets at the SAME second — the live API writes rapid
    // edits at 1s granularity. Newest-first delivery order must NOT decide
    // which is "original"; the chain root (null -> 2026-09-01) does.
    const deals = [
      {
        id: 11,
        title: 'Same-second',
        owner_id: 1,
        expected_close_date: '2026-09-21',
      },
    ]
    const t = '2026-06-05 14:36:05' // identical timestamp, space-separated
    const transitionsByDeal = [
      entry(11, [
        // newest-first
        {
          field_key: 'expected_close_date',
          old_value: '2026-09-11',
          new_value: '2026-09-21',
          time: t,
        },
        {
          field_key: 'expected_close_date',
          old_value: '2026-09-01',
          new_value: '2026-09-11',
          time: t,
        },
        {
          field_key: 'expected_close_date',
          old_value: '',
          new_value: '2026-09-01',
          time: t,
        },
      ]),
    ]

    const rows = computeSlippage(deals, transitionsByDeal, {})
    expect(rows[0].originalCloseDate).toBe('2026-09-01')
    expect(rows[0].pushCount).toBe(2)
    expect(rows[0].netDaysSlipped).toBe(20) // 10 + 10
  })

  it('falls past a fully-garbage chain row to the next real date', () => {
    const deals = [
      {
        id: 15,
        title: 'Garbled',
        owner_id: 1,
        expected_close_date: '2026-02-01',
      },
    ]
    const transitionsByDeal = [
      entry(15, [
        // a garbage->garbage row (its old is never produced -> looks like a
        // root, but neither side parses) must be skipped for the original.
        {
          field_key: 'expected_close_date',
          old_value: 'xx',
          new_value: 'yy',
          time: '2026-01-03 00:00:00',
        },
        {
          field_key: 'expected_close_date',
          old_value: '2026-01-01',
          new_value: '2026-02-01',
          time: '2026-01-02 00:00:00',
        },
      ]),
    ]
    const rows = computeSlippage(deals, transitionsByDeal, {})
    expect(rows[0].originalCloseDate).toBe('2026-01-01')
    expect(rows[0].pushCount).toBe(1)
  })
})
