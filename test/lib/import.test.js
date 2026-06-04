import { describe, it, expect } from 'vitest'
import { prepareImportBodies } from '../../src/lib/import.js'

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
