import { describe, it, expect } from 'vitest'
import { buildWriteBody } from '../../src/lib/input.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'
const HASH2 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const DEFS = [
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
  {
    id: 3,
    field_code: HASH2,
    field_name: 'Score',
    field_type: 'double',
  },
  {
    id: 4,
    field_code: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    field_name: 'Tags',
    field_type: 'set',
    options: [
      { id: 1, label: 'A' },
      { id: 2, label: 'B' },
    ],
  },
]

describe('buildWriteBody', () => {
  it('tolerates a field def with no field_name when matching by hash code', () => {
    const defs = [{ field_code: HASH, field_type: 'varchar' }] // no field_name
    const body = buildWriteBody({ fields: [`${HASH}=X-9`], defs })
    expect(body.custom_fields).toEqual({ [HASH]: 'X-9' })
  })

  it('keeps defined typed values and drops undefined ones', () => {
    const body = buildWriteBody({
      typed: { title: 'New deal', value: 100, stage_id: undefined },
    })
    expect(body).toEqual({ title: 'New deal', value: 100 })
  })

  it('merges raw --body JSON under typed flags (flags win)', () => {
    const body = buildWriteBody({
      typed: { title: 'Flag title' },
      rawBody: '{"title":"Body title","probability":50}',
    })
    expect(body).toEqual({ title: 'Flag title', probability: 50 })
  })

  it('throws 65 on invalid --body JSON', () => {
    expect(() => buildWriteBody({ rawBody: '{nope' })).toThrow(/JSON/)
    try {
      buildWriteBody({ rawBody: '{nope' })
    } catch (err) {
      expect(err.exitCode).toBe(65)
    }
  })

  describe('--field custom-field resolution', () => {
    it('resolves a varchar custom field by hash key directly', () => {
      const body = buildWriteBody({
        fields: [`${HASH2}=12.5`],
        defs: DEFS,
      })
      expect(body.custom_fields[HASH2]).toBe(12.5)
    })

    it('resolves field names to hash keys', () => {
      const body = buildWriteBody({
        fields: ['Score=3.5'],
        defs: DEFS,
      })
      expect(body.custom_fields[HASH2]).toBe(3.5)
    })

    it('resolves enum option labels to option IDs', () => {
      const body = buildWriteBody({
        fields: ['Deal Size=Large'],
        defs: DEFS,
      })
      expect(body.custom_fields[HASH]).toBe(11)
    })

    it('resolves set fields to arrays of option IDs', () => {
      const body = buildWriteBody({
        fields: ['Tags=A,B'],
        defs: DEFS,
      })
      expect(
        body.custom_fields.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
      ).toEqual([1, 2])
    })

    it('routes standard (non-custom) field codes to the body root', () => {
      const body = buildWriteBody({
        fields: ['Title=Rooted'],
        defs: DEFS,
      })
      expect(body.title).toBe('Rooted')
      expect(body.custom_fields).toBeUndefined()
    })

    it('throws 65 for a non-numeric value on a numeric field', () => {
      expect(() =>
        buildWriteBody({ fields: ['Score=not-a-number'], defs: DEFS }),
      ).toThrow(/number/i)
      try {
        buildWriteBody({ fields: ['Score=not-a-number'], defs: DEFS })
      } catch (err) {
        expect(err.exitCode).toBe(65)
      }
    })

    it('names a numeric field by its hash code when it has no field_name', () => {
      const defs = [{ field_code: HASH2, field_type: 'double' }] // no field_name
      try {
        buildWriteBody({ fields: [`${HASH2}=nope`], defs })
        throw new Error('should have thrown')
      } catch (err) {
        expect(err.exitCode).toBe(65)
        expect(err.message).toContain(HASH2)
      }
    })

    it('throws 65 for an unknown field name with a hint', () => {
      expect(() => buildWriteBody({ fields: ['Nope=1'], defs: DEFS })).toThrow(
        /field list/,
      )
    })

    it('throws 65 for an unknown enum label listing valid options', () => {
      expect(() =>
        buildWriteBody({ fields: ['Deal Size=Gigantic'], defs: DEFS }),
      ).toThrow(/Small, Large/)
    })

    it('throws 64 for a malformed --field entry', () => {
      expect(() =>
        buildWriteBody({ fields: ['no-equals-sign'], defs: DEFS }),
      ).toThrow(/Name=Value/)
    })

    it('allows = inside the value', () => {
      const body = buildWriteBody({
        fields: ['Title=a=b'],
        defs: DEFS,
      })
      expect(body.title).toBe('a=b')
    })
  })
})

describe('buildWriteBody edge cases', () => {
  it('treats --field without defs as unknown', () => {
    expect(() => buildWriteBody({ fields: ['X=1'] })).toThrow(/Unknown field/)
  })

  it('reports (none) for enum fields with no options', () => {
    const defs = [
      {
        id: 9,
        field_code: 'cccccccccccccccccccccccccccccccccccccccc',
        field_name: 'Empty Enum',
        field_type: 'enum',
      },
    ]
    expect(() => buildWriteBody({ fields: ['Empty Enum=x'], defs })).toThrow(
      /\(none\)/,
    )
  })

  it('respects an explicit is_custom_field=false on hash-less codes', () => {
    const defs = [
      {
        id: 10,
        field_code: 'label_ids',
        field_name: 'Label',
        field_type: 'set',
        is_custom_field: false,
        options: [{ id: 27, label: 'Hot' }],
      },
    ]
    const body = buildWriteBody({ fields: ['Label=Hot'], defs })
    expect(body.label_ids).toEqual([27])
    expect(body.custom_fields).toBeUndefined()
  })
})
