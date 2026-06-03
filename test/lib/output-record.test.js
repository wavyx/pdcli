import { describe, it, expect } from 'vitest'
import { flattenRecord } from '../../src/lib/output/record.js'

describe('flattenRecord', () => {
  it('turns a record into field/value rows', () => {
    const rows = flattenRecord({ id: 1, title: 'Deal' })
    expect(rows).toEqual([
      { field: 'id', value: '1' },
      { field: 'title', value: 'Deal' },
    ])
  })

  it('hoists custom_fields entries to top-level rows', () => {
    const rows = flattenRecord({
      id: 1,
      custom_fields: { 'Deal Size': 'Large' },
    })
    expect(rows).toContainEqual({ field: 'Deal Size', value: 'Large' })
    expect(rows.find((r) => r.field === 'custom_fields')).toBeUndefined()
  })

  it('renders arrays joined and objects as JSON', () => {
    const rows = flattenRecord({
      tags: ['a', 'b'],
      owner: { id: 2, name: 'Jane' },
      empty: null,
    })
    expect(rows).toContainEqual({ field: 'tags', value: 'a, b' })
    expect(rows).toContainEqual({
      field: 'owner',
      value: '{"id":2,"name":"Jane"}',
    })
    expect(rows).toContainEqual({ field: 'empty', value: '' })
  })
})
