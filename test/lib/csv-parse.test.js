import { describe, it, expect } from 'vitest'
import { parseCsv } from '../../src/lib/csv-parse.js'

describe('parseCsv', () => {
  it('parses headers and rows', () => {
    const { headers, rows } = parseCsv(
      'name,email\nJane,j@a.com\nBob,b@a.com\n',
    )
    expect(headers).toEqual(['name', 'email'])
    expect(rows).toEqual([
      ['Jane', 'j@a.com'],
      ['Bob', 'b@a.com'],
    ])
  })

  it('handles quoted fields with embedded commas', () => {
    const { rows } = parseCsv('name,org\n"Doe, Jane",Acme\n')
    expect(rows).toEqual([['Doe, Jane', 'Acme']])
  })

  it('handles escaped double quotes', () => {
    const { rows } = parseCsv('name\n"Say ""hi"""\n')
    expect(rows).toEqual([['Say "hi"']])
  })

  it('handles embedded newlines inside quotes', () => {
    const { rows } = parseCsv('note\n"line1\nline2"\n')
    expect(rows).toEqual([['line1\nline2']])
  })

  it('handles CRLF line endings', () => {
    const { headers, rows } = parseCsv('a,b\r\n1,2\r\n')
    expect(headers).toEqual(['a', 'b'])
    expect(rows).toEqual([['1', '2']])
  })

  it('skips trailing blank lines and empty rows', () => {
    const { rows } = parseCsv('a\n1\n\n\n')
    expect(rows).toEqual([['1']])
  })

  it('throws 65 when a row has more cells than headers', () => {
    expect(() => parseCsv('a,b\n1,2,3\n')).toThrow(/row 2/i)
  })

  it('pads short rows with empty strings', () => {
    const { rows } = parseCsv('a,b,c\n1,2\n')
    expect(rows).toEqual([['1', '2', '']])
  })

  it('throws 65 on an empty file', () => {
    expect(() => parseCsv('')).toThrow(/empty/i)
  })

  it('throws 65 on an unterminated quote', () => {
    expect(() => parseCsv('a\n"oops\n')).toThrow(/unterminated/i)
  })

  it('strips a leading UTF-8 BOM so the first header is clean', () => {
    const { headers, rows } = parseCsv('﻿name,email\nJane,j@a.com\n')
    expect(headers).toEqual(['name', 'email'])
    expect(rows).toEqual([['Jane', 'j@a.com']])
  })
})

describe('parseCsv without trailing newline', () => {
  it('keeps the final record', () => {
    const { rows } = parseCsv('a,b\n1,2')
    expect(rows).toEqual([['1', '2']])
  })
})
