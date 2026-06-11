import { describe, it, expect } from 'vitest'
import { categorizeChange, buildChangeFeed } from '../../src/lib/changes.js'

describe('categorizeChange', () => {
  const since = '2026-06-01T00:00:00Z'

  it('is created when add_time is at or after the since boundary', () => {
    expect(categorizeChange({ add_time: '2026-06-05T00:00:00Z' }, since)).toBe(
      'created',
    )
    expect(categorizeChange({ add_time: since }, since)).toBe('created')
  })

  it('is updated when add_time predates the boundary', () => {
    expect(categorizeChange({ add_time: '2026-05-01T00:00:00Z' }, since)).toBe(
      'updated',
    )
  })

  it('is updated when add_time is missing or no boundary is known', () => {
    expect(categorizeChange({ add_time: null }, since)).toBe('updated')
    expect(categorizeChange({ add_time: '2026-06-05T00:00:00Z' }, null)).toBe(
      'updated',
    )
  })
})

describe('buildChangeFeed', () => {
  const since = '2026-06-01T00:00:00Z'
  const byEntity = {
    deals: [
      {
        id: 1,
        title: 'New deal',
        add_time: '2026-06-05T00:00:00Z',
        update_time: '2026-06-05T00:00:00Z',
      },
      {
        id: 2,
        title: 'Old deal touched',
        add_time: '2026-01-01T00:00:00Z',
        update_time: '2026-06-09T00:00:00Z',
      },
    ],
    persons: [
      {
        id: 7,
        name: 'Jane',
        add_time: '2026-06-02T00:00:00Z',
        update_time: '2026-06-03T00:00:00Z',
      },
    ],
  }

  it('produces a unified, entity-tagged feed sorted by update_time ascending', () => {
    const { rows } = buildChangeFeed(byEntity, since)
    expect(rows.map((r) => `${r.entity}:${r.id}`)).toEqual([
      'persons:7', // 06-03
      'deals:1', // 06-05
      'deals:2', // 06-09
    ])
    expect(rows[0]).toMatchObject({ entity: 'persons', title: 'Jane' })
  })

  it('tags each row created vs updated by add_time', () => {
    const { rows } = buildChangeFeed(byEntity, since)
    const byId = new Map(rows.map((r) => [`${r.entity}:${r.id}`, r]))
    expect(byId.get('deals:1').change).toBe('created')
    expect(byId.get('deals:2').change).toBe('updated')
    expect(byId.get('persons:7').change).toBe('created')
  })

  it('returns the newest update_time as the next watermark', () => {
    const { maxUpdate } = buildChangeFeed(byEntity, since)
    expect(maxUpdate.toISOString()).toBe('2026-06-09T00:00:00.000Z')
  })

  it('resolves the title field per entity (subject for activities, name for products)', () => {
    const { rows } = buildChangeFeed(
      {
        activities: [
          { id: 1, subject: 'Call', update_time: '2026-06-04T00:00:00Z' },
        ],
        products: [
          { id: 9, name: 'Widget', update_time: '2026-06-04T00:00:00Z' },
        ],
      },
      since,
    )
    const act = rows.find((r) => r.entity === 'activities')
    const prod = rows.find((r) => r.entity === 'products')
    expect(act.title).toBe('Call')
    expect(prod.title).toBe('Widget')
  })

  it('tolerates rows missing both title and update_time', () => {
    const { rows, maxUpdate } = buildChangeFeed(
      {
        deals: [
          { id: 1, update_time: null },
          { id: 2, update_time: null },
        ],
      },
      since,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].title).toBeNull()
    expect(maxUpdate).toBeNull()
  })

  it('returns an empty feed and null watermark for no changes', () => {
    expect(buildChangeFeed({ deals: [], persons: [] }, since)).toEqual({
      rows: [],
      maxUpdate: null,
    })
  })

  it('sorts ascending by update_time with missing timestamps last', () => {
    const { rows, maxUpdate } = buildChangeFeed(
      {
        deals: [
          { id: 2, title: 'later', update_time: '2026-06-05T00:00:00Z' },
          { id: 1, title: 'no ts', update_time: null },
          { id: 3, title: 'earlier', update_time: '2026-06-01T00:00:00Z' },
        ],
      },
      since,
    )
    expect(rows.map((r) => r.id)).toEqual([3, 2, 1])
    expect(maxUpdate.toISOString()).toBe('2026-06-05T00:00:00.000Z')
  })
})
