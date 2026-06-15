import { describe, it, expect } from 'vitest'
import { prepareImportBodies, intCell } from '../../src/lib/import.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

const DEFS = [
  {
    id: 2,
    field_code: HASH,
    field_name: 'Segment',
    field_type: 'enum',
    is_custom_field: true,
    options: [
      { id: 10, label: 'SMB' },
      { id: 11, label: 'Enterprise' },
    ],
  },
]

const PERSON_SPECIALS = {
  name: (typed, value) => {
    typed.name = value
  },
  email: (typed, value) => {
    typed.emails = [{ value, primary: true }]
  },
  phone: (typed, value) => {
    typed.phones = [{ value, primary: true }]
  },
}

describe('intCell', () => {
  it('parses an integer id cell', () => {
    expect(intCell('42', 'org_id')).toBe(42)
  })

  it.each(['N/A', '12a', '1.5', 'abc'])(
    'throws 65 on a non-integer cell %j',
    (value) => {
      let caught
      try {
        intCell(value, 'org_id')
      } catch (e) {
        caught = e
      }
      expect(caught.exitCode).toBe(65)
      expect(caught.message).toMatch(/org_id/)
    },
  )
})

describe('prepareImportBodies special-column validation', () => {
  it('reports the CSV row number when a special column rejects a value', () => {
    const specials = {
      ...PERSON_SPECIALS,
      org_id: (typed, value) => {
        typed.org_id = intCell(value, 'org_id')
      },
    }
    expect(() =>
      prepareImportBodies({
        headers: ['name', 'org_id'],
        rows: [
          ['Ok', '5'],
          ['Bad', 'N/A'],
        ],
        specialColumns: specials,
        defs: [],
      }),
    ).toThrow(/row 3/i)
  })
})

describe('prepareImportBodies duplicate headers', () => {
  it('rejects a duplicate column header with exit 65 instead of losing data', () => {
    expect(() =>
      prepareImportBodies({
        headers: ['name', 'email', 'email'],
        rows: [['Jane', 'first@a.com', 'second@a.com']],
        specialColumns: PERSON_SPECIALS,
        defs: DEFS,
      }),
    ).toThrowError(/duplicate/i)
  })

  it('rejects duplicate headers case-insensitively', () => {
    let caught
    try {
      prepareImportBodies({
        headers: ['Name', 'name'],
        rows: [['Jane', 'Jane']],
        specialColumns: PERSON_SPECIALS,
        defs: DEFS,
      })
    } catch (e) {
      caught = e
    }
    expect(caught.exitCode).toBe(65)
  })
})

describe('prepareImportBodies', () => {
  it('maps special columns and resolves the rest via field defs', () => {
    const bodies = prepareImportBodies({
      headers: ['name', 'email', 'Segment'],
      rows: [['Jane Doe', 'jane@acme.com', 'Enterprise']],
      specialColumns: PERSON_SPECIALS,
      defs: DEFS,
    })

    expect(bodies).toEqual([
      {
        name: 'Jane Doe',
        emails: [{ value: 'jane@acme.com', primary: true }],
        custom_fields: { [HASH]: 11 },
      },
    ])
  })

  it('matches special columns case-insensitively', () => {
    const bodies = prepareImportBodies({
      headers: ['Name', 'EMAIL'],
      rows: [['Bob', 'b@a.com']],
      specialColumns: PERSON_SPECIALS,
      defs: [],
    })
    expect(bodies[0].name).toBe('Bob')
    expect(bodies[0].emails[0].value).toBe('b@a.com')
  })

  it('skips empty cells entirely', () => {
    const bodies = prepareImportBodies({
      headers: ['name', 'email'],
      rows: [['NoEmail', '']],
      specialColumns: PERSON_SPECIALS,
      defs: [],
    })
    expect(bodies[0]).toEqual({ name: 'NoEmail' })
  })

  it('reports the CSV row number for bad values', () => {
    expect(() =>
      prepareImportBodies({
        headers: ['name', 'Segment'],
        rows: [
          ['Ok', 'SMB'],
          ['Bad', 'Galactic'],
        ],
        specialColumns: PERSON_SPECIALS,
        defs: DEFS,
      }),
    ).toThrow(/row 3/i)
  })

  it('reports unknown headers with the row number', () => {
    expect(() =>
      prepareImportBodies({
        headers: ['name', 'mystery_column'],
        rows: [['X', 'y']],
        specialColumns: PERSON_SPECIALS,
        defs: [],
      }),
    ).toThrow(/mystery_column/)
  })
})
