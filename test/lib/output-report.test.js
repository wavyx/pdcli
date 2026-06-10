import { describe, it, expect } from 'vitest'
import {
  formatMarkdownReport,
  formatHtmlReport,
} from '../../src/lib/output/report.js'

const REPORT = {
  title: 'Monday packet — Sales',
  meta: [
    { label: 'Generated', value: '2026-06-10' },
    { label: 'Pipeline', value: 'Sales & Co' },
  ],
  sections: [
    {
      heading: 'Velocity',
      type: 'kv',
      pairs: [
        { label: 'Win rate', value: '50%' },
        { label: 'Avg cycle', value: 30 },
      ],
    },
    {
      heading: 'Forecast',
      type: 'table',
      columns: [
        { key: 'month', header: 'Month' },
        { key: 'commit', header: 'Commit' },
      ],
      rows: [
        { month: '2026-07', commit: 50000 },
        { month: '2026-08', commit: null },
        { month: 'a|b', commit: 1 }, // pipe must be escaped in markdown
      ],
    },
    {
      heading: 'Risks',
      type: 'lines',
      lines: ['2 deals past close', '1 stale deal'],
    },
    {
      heading: 'Findings',
      type: 'table',
      columns: [{ key: 'x', header: 'X' }],
      rows: [],
    },
  ],
}

describe('formatMarkdownReport', () => {
  const md = formatMarkdownReport(REPORT)

  it('renders the title as an H1 and meta as a bullet list', () => {
    expect(md.startsWith('# Monday packet — Sales')).toBe(true)
    expect(md).toContain('- **Generated**: 2026-06-10')
    expect(md).toContain('- **Pipeline**: Sales & Co')
  })

  it('renders a kv section as bold-label bullets under an H2', () => {
    expect(md).toContain('## Velocity')
    expect(md).toContain('- **Win rate**: 50%')
    expect(md).toContain('- **Avg cycle**: 30')
  })

  it('renders a table with header, separator, and rows; null as a dash', () => {
    expect(md).toContain('| Month | Commit |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| 2026-07 | 50000 |')
    expect(md).toContain('| 2026-08 | — |')
  })

  it('escapes pipe characters inside table cells', () => {
    expect(md).toContain('| a\\|b | 1 |')
  })

  it('renders a lines section as a bullet list', () => {
    expect(md).toContain('## Risks')
    expect(md).toContain('- 2 deals past close')
  })

  it('renders an empty table as a "None." line', () => {
    expect(md).toMatch(/## Findings\n\nNone\./)
  })
})

describe('formatHtmlReport', () => {
  const html = formatHtmlReport(REPORT)

  it('produces a standalone HTML document with an escaped title', () => {
    expect(html.toLowerCase()).toContain('<!doctype html>')
    expect(html).toContain('<title>Monday packet — Sales</title>')
    expect(html).toContain('<h1>Monday packet — Sales</h1>')
  })

  it('escapes HTML-special characters in values', () => {
    // "Sales & Co" → ampersand must be entity-encoded
    expect(html).toContain('Sales &amp; Co')
  })

  it('renders a table with th/td cells and null as a dash', () => {
    expect(html).toContain('<h2>Forecast</h2>')
    expect(html).toContain('<th>Month</th>')
    expect(html).toContain('<td>2026-07</td>')
    expect(html).toContain('<td>—</td>')
  })

  it('renders kv and lines sections as lists', () => {
    expect(html).toContain('<h2>Velocity</h2>')
    expect(html).toContain('<strong>Win rate</strong>')
    expect(html).toContain('<li>2 deals past close</li>')
  })

  it('renders an empty table as a None paragraph', () => {
    expect(html).toContain('<h2>Findings</h2>')
    expect(html).toMatch(/<h2>Findings<\/h2>\s*<p>None\.<\/p>/)
  })

  it('escapes a less-than sign in a cell to avoid breaking markup', () => {
    const out = formatHtmlReport({
      title: 'T',
      meta: [],
      sections: [
        {
          heading: 'S',
          type: 'table',
          columns: [{ key: 'v', header: 'V' }],
          rows: [{ v: '<script>' }],
        },
      ],
    })
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>')
  })
})
