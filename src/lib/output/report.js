/**
 * Renderers for a composite "report" object into Markdown or standalone HTML —
 * the shareable artifact forms of a multi-section analytics packet (e.g. the
 * Monday digest). Both consume the SAME report shape; only the wrapper differs.
 *
 * @typedef {object} ReportTableSection
 * @property {string} heading
 * @property {'table'} type
 * @property {{ key: string, header: string }[]} columns
 * @property {object[]} rows
 *
 * @typedef {object} ReportKvSection
 * @property {string} heading
 * @property {'kv'} type
 * @property {{ label: string, value: * }[]} pairs
 *
 * @typedef {object} ReportLinesSection
 * @property {string} heading
 * @property {'lines'} type
 * @property {string[]} lines
 *
 * @typedef {object} Report
 * @property {string} title
 * @property {{ label: string, value: * }[]} meta
 * @property {(ReportTableSection|ReportKvSection|ReportLinesSection)[]} sections
 */

const DASH = '—'

/** Display value: null/undefined render as an em dash, everything else as-is. */
function displayValue(value) {
  return value == null ? DASH : String(value)
}

// ---- Markdown ----

/** Collapse any CR/LF run to a single space so a value can't break structure. */
function mdInline(value) {
  return displayValue(value).replace(/[\r\n]+/g, ' ')
}

function mdCell(value) {
  // Escape pipes so a cell value can't break the table grid; collapse newlines.
  return mdInline(value).replace(/\|/g, '\\|')
}

function mdTable(section) {
  if (section.rows.length === 0) return ['None.']
  const header = `| ${section.columns.map((c) => c.header).join(' | ')} |`
  const sep = `| ${section.columns.map(() => '---').join(' | ')} |`
  const body = section.rows.map(
    (row) =>
      `| ${section.columns.map((c) => mdCell(row[c.key])).join(' | ')} |`,
  )
  return [header, sep, ...body]
}

/**
 * Render a report as GitHub-flavored Markdown.
 * @param {Report} report
 * @returns {string}
 */
export function formatMarkdownReport(report) {
  const out = [`# ${mdInline(report.title)}`, '']
  for (const m of report.meta) {
    out.push(`- **${m.label}**: ${mdInline(m.value)}`)
  }
  for (const section of report.sections) {
    out.push('', `## ${section.heading}`, '')
    if (section.type === 'table') {
      out.push(...mdTable(section))
    } else if (section.type === 'kv') {
      for (const p of section.pairs) {
        out.push(`- **${p.label}**: ${mdInline(p.value)}`)
      }
    } else {
      for (const line of section.lines) out.push(`- ${line}`)
    }
  }
  return out.join('\n')
}

// ---- HTML ----

function htmlEsc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape a display value (em dash passes through untouched). */
function htmlCell(value) {
  return value == null ? DASH : htmlEsc(String(value))
}

function htmlTable(section) {
  if (section.rows.length === 0) return '<p>None.</p>'
  const head = section.columns
    .map((c) => `<th>${htmlEsc(c.header)}</th>`)
    .join('')
  const body = section.rows
    .map(
      (row) =>
        `<tr>${section.columns
          .map((c) => `<td>${htmlCell(row[c.key])}</td>`)
          .join('')}</tr>`,
    )
    .join('\n')
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`
}

const HTML_STYLE =
  '<style>body{font:14px/1.5 system-ui,sans-serif;max-width:60rem;' +
  'margin:2rem auto;padding:0 1rem;color:#1a1a1a}table{border-collapse:collapse;' +
  'width:100%}th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left}' +
  'th{background:#f5f5f5}h2{margin-top:2rem}</style>'

/**
 * Render a report as a standalone HTML document.
 * @param {Report} report
 * @returns {string}
 */
export function formatHtmlReport(report) {
  const out = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${htmlEsc(report.title)}</title>`,
    HTML_STYLE,
    '</head><body>',
    `<h1>${htmlEsc(report.title)}</h1>`,
  ]
  if (report.meta.length > 0) {
    out.push('<ul class="meta">')
    for (const m of report.meta) {
      out.push(
        `<li><strong>${htmlEsc(m.label)}:</strong> ${htmlCell(m.value)}</li>`,
      )
    }
    out.push('</ul>')
  }
  for (const section of report.sections) {
    out.push(`<h2>${htmlEsc(section.heading)}</h2>`)
    if (section.type === 'table') {
      out.push(htmlTable(section))
    } else if (section.type === 'kv') {
      out.push('<ul>')
      for (const p of section.pairs) {
        out.push(
          `<li><strong>${htmlEsc(p.label)}</strong>: ${htmlCell(p.value)}</li>`,
        )
      }
      out.push('</ul>')
    } else {
      out.push('<ul>')
      for (const line of section.lines) out.push(`<li>${htmlEsc(line)}</li>`)
      out.push('</ul>')
    }
  }
  out.push('</body></html>')
  return out.join('\n')
}
