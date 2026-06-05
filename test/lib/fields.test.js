import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  entityToFieldsPath,
  getFields,
  clearFieldsCache,
  makeResolver,
} from '../../src/lib/fields.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

const FIELD_DEFS = [
  { id: 1, field_code: 'title', field_name: 'Title', field_type: 'varchar' },
  {
    id: 2,
    field_code: HASH,
    field_name: 'Deal Size',
    field_type: 'enum',
    options: [
      { id: 10, label: 'Small' },
      { id: 11, label: 'Large' },
    ],
  },
]

function fakeClient(defs = FIELD_DEFS) {
  return {
    pageV2: vi.fn(async function* () {
      yield* defs
    }),
  }
}

describe('entityToFieldsPath', () => {
  it('maps entity aliases to v2 fields endpoints', () => {
    expect(entityToFieldsPath('deal')).toBe('/api/v2/dealFields')
    expect(entityToFieldsPath('person')).toBe('/api/v2/personFields')
    expect(entityToFieldsPath('org')).toBe('/api/v2/organizationFields')
    expect(entityToFieldsPath('organization')).toBe(
      '/api/v2/organizationFields',
    )
    expect(entityToFieldsPath('product')).toBe('/api/v2/productFields')
    expect(entityToFieldsPath('activity')).toBe('/api/v2/activityFields')
  })

  it('throws on an unknown entity', () => {
    expect(() => entityToFieldsPath('banana')).toThrow(/unknown entity/i)
  })
})

describe('getFields', () => {
  beforeEach(() => {
    clearFieldsCache()
  })

  it('fetches field definitions via cursor pagination', async () => {
    const client = fakeClient()

    const defs = await getFields(client, 'deal')

    expect(client.pageV2).toHaveBeenCalledWith('/api/v2/dealFields')
    expect(defs).toEqual(FIELD_DEFS)
  })

  it('memoizes per entity within a run', async () => {
    const client = fakeClient()

    await getFields(client, 'deal')
    await getFields(client, 'deal')

    expect(client.pageV2).toHaveBeenCalledTimes(1)
  })

  it('fetches separately per entity', async () => {
    const client = fakeClient()

    await getFields(client, 'deal')
    await getFields(client, 'person')

    expect(client.pageV2).toHaveBeenCalledTimes(2)
  })
})

describe('makeResolver', () => {
  const resolver = makeResolver(FIELD_DEFS)

  it('resolves a human name to the hashed key (case-insensitive)', () => {
    expect(resolver.nameToKey('Deal Size')).toBe(HASH)
    expect(resolver.nameToKey('deal size')).toBe(HASH)
  })

  it('returns undefined for unknown names', () => {
    expect(resolver.nameToKey('Nope')).toBeUndefined()
  })

  it('resolves a hashed key back to the human name', () => {
    expect(resolver.keyToName(HASH)).toBe('Deal Size')
  })

  it('resolves option labels to IDs and back', () => {
    expect(resolver.labelToOptionId(HASH, 'Large')).toBe(11)
    expect(resolver.labelToOptionId(HASH, 'large')).toBe(11)
    expect(resolver.optionIdToLabel(HASH, 10)).toBe('Small')
  })

  it('returns undefined for option lookups on non-option fields', () => {
    expect(resolver.labelToOptionId('title', 'x')).toBeUndefined()
    expect(resolver.optionIdToLabel('title', 1)).toBeUndefined()
  })

  it('resolveCustomFields maps hash keys to names and option ids to labels', () => {
    const record = {
      id: 5,
      title: 'Big deal',
      custom_fields: {
        [HASH]: 11,
      },
    }

    const resolved = resolver.resolveCustomFields(record)

    expect(resolved.custom_fields).toEqual({ 'Deal Size': 'Large' })
    expect(resolved.id).toBe(5)
    // original record untouched
    expect(record.custom_fields).toEqual({ [HASH]: 11 })
  })

  it('resolveCustomFields handles set fields (arrays of option ids)', () => {
    const setResolver = makeResolver([
      {
        id: 3,
        field_code: HASH,
        field_name: 'Tags',
        field_type: 'set',
        options: [
          { id: 1, label: 'A' },
          { id: 2, label: 'B' },
        ],
      },
    ])

    const resolved = setResolver.resolveCustomFields({
      custom_fields: { [HASH]: [1, 2] },
    })

    expect(resolved.custom_fields).toEqual({ Tags: ['A', 'B'] })
  })

  it('resolveCustomFields passes through records without custom_fields', () => {
    const record = { id: 1 }
    expect(resolver.resolveCustomFields(record)).toEqual({ id: 1 })
  })
})

describe('resolveCustomFields fallbacks', () => {
  const resolver = makeResolver(FIELD_DEFS)

  it('keeps unknown hash keys and unknown option ids as-is', () => {
    const resolved = resolver.resolveCustomFields({
      custom_fields: {
        unknown_key_here: 'raw',
        [HASH]: 999, // option id not in definition
      },
    })
    expect(resolved.custom_fields.unknown_key_here).toBe('raw')
    expect(resolved.custom_fields['Deal Size']).toBe(999)
  })

  it('passes null custom values through untouched', () => {
    const resolved = resolver.resolveCustomFields({
      custom_fields: { [HASH]: null },
    })
    expect(resolved.custom_fields['Deal Size']).toBeNull()
  })

  it('keeps unknown ids inside set arrays', () => {
    const setResolver = makeResolver([
      {
        id: 3,
        field_code: HASH,
        field_name: 'Tags',
        field_type: 'set',
        options: [{ id: 1, label: 'A' }],
      },
    ])
    const resolved = setResolver.resolveCustomFields({
      custom_fields: { [HASH]: [1, 99] },
    })
    expect(resolved.custom_fields.Tags).toEqual(['A', 99])
  })

  it('disambiguates duplicate field names instead of clobbering values', () => {
    // Accounts can hold two custom fields with the same name; the second
    // must not silently overwrite the first in resolved output.
    const hashA = 'a'.repeat(40)
    const hashB = 'b'.repeat(40)
    const dupResolver = makeResolver([
      {
        id: 1,
        field_code: hashA,
        field_name: 'Deal Size',
        field_type: 'varchar',
      },
      {
        id: 2,
        field_code: hashB,
        field_name: 'Deal Size',
        field_type: 'varchar',
      },
    ])
    const resolved = dupResolver.resolveCustomFields({
      custom_fields: { [hashA]: 'big', [hashB]: null },
    })
    expect(resolved.custom_fields['Deal Size']).toBe('big')
    expect(
      resolved.custom_fields[`Deal Size (${hashB.slice(0, 8)})`],
    ).toBeNull()
    expect(Object.keys(resolved.custom_fields)).toHaveLength(2)
  })
})
