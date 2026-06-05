import { describe, it, expect } from 'vitest'
import { escapeXml, buildDemoSvg, SCRIPT } from '../scripts/gen-demo.mjs'

describe('escapeXml', () => {
  it('escapes the five XML-significant characters', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b')
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;')
    expect(escapeXml('say "hi"')).toBe('say &quot;hi&quot;')
    expect(escapeXml("it's")).toBe('it&apos;s')
  })

  it('escapes ampersand before angle brackets so entities are not doubled', () => {
    // A naive order would turn "<" into "&lt;" then "&" into "&amp;lt;".
    expect(escapeXml('1 < 2 & 3 > 0')).toBe('1 &lt; 2 &amp; 3 &gt; 0')
  })

  it('coerces non-string input to a string', () => {
    expect(escapeXml(4821)).toBe('4821')
    expect(escapeXml(null)).toBe('')
    expect(escapeXml(undefined)).toBe('')
  })
})

describe('SCRIPT', () => {
  it('reuses the homepage hero scenes — pipeline health then deal update', () => {
    expect(Array.isArray(SCRIPT)).toBe(true)
    expect(SCRIPT).toHaveLength(2)
    expect(SCRIPT[0].cmd).toBe('pdcli pipeline health')
    expect(SCRIPT[1].cmd).toBe('pdcli deal update 4821 --status won')
    // Each scene carries its rendered output lines (each a {t, cls} record).
    for (const scene of SCRIPT) {
      expect(typeof scene.cmd).toBe('string')
      expect(Array.isArray(scene.out)).toBe(true)
      expect(scene.out.length).toBeGreaterThan(0)
      for (const line of scene.out) {
        expect(typeof line.t).toBe('string')
        expect(typeof line.cls).toBe('string')
      }
    }
  })

  it('shows a health table for the first scene', () => {
    const out = SCRIPT[0].out.map((l) => l.t).join('\n')
    expect(out).toMatch(/Qualified/)
    expect(out).toMatch(/Negotiation/)
  })

  it('shows a won confirmation for the second scene', () => {
    const out = SCRIPT[1].out.map((l) => l.t).join('\n')
    expect(out).toMatch(/Won/)
  })
})

describe('buildDemoSvg', () => {
  it('emits a self-contained SVG root with width 720', () => {
    const svg = buildDemoSvg()
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('width="720"')
  })

  it('draws a dark rounded terminal frame with traffic-light dots', () => {
    const svg = buildDemoSvg()
    // dark terminal background
    expect(svg).toContain('#0c1611')
    // rounded 14px frame
    expect(svg).toContain('rx="14"')
    // three traffic-light dots
    const dots = svg.match(/class="dot"/g) || []
    expect(dots).toHaveLength(3)
  })

  it('uses a monospace font stack', () => {
    expect(buildDemoSvg()).toMatch(/monospace/)
  })

  it('animates with SMIL and loops indefinitely (no scripts, no foreignObject)', () => {
    const svg = buildDemoSvg()
    expect(svg).toContain('<animate')
    expect(svg).toContain('repeatCount="indefinite"')
    // GitHub <img> sandbox forbids these.
    expect(svg).not.toContain('foreignObject')
    expect(svg).not.toContain('<script')
  })

  it('does not reference external fonts or scripts', () => {
    const svg = buildDemoSvg()
    // The only URL allowed is the SVG namespace identifier (not a fetched
    // resource). Any other http(s) reference would mean an external dep.
    const urls = svg.match(/https?:\/\/[^\s"']*/g) || []
    expect(urls).toEqual(['http://www.w3.org/2000/svg'])
  })

  it('renders both commands from the script', () => {
    const svg = buildDemoSvg()
    expect(svg).toContain('pdcli pipeline health')
    expect(svg).toContain('pdcli deal update 4821 --status won')
  })

  it('escapes the escaping helper output and emits no raw stray entities', () => {
    // The helper itself escapes angle brackets and ampersands in any text it
    // is given (command or output) so the document stays well-formed XML.
    const sample = escapeXml('pdcli api GET /deals?ids=<1>&n=2')
    expect(sample).toContain('&lt;1&gt;')
    expect(sample).toContain('&amp;n=2')

    // And the rendered document has no dangling `&` (every `&` is an entity).
    const svg = buildDemoSvg()
    const danglingAmp = svg.match(/&(?!amp;|lt;|gt;|quot;|apos;|#)/g) || []
    expect(danglingAmp).toEqual([])
  })

  it('is deterministic — two builds are byte-identical (no clock, no randomness)', () => {
    expect(buildDemoSvg()).toBe(buildDemoSvg())
  })

  it('totals roughly 12 seconds of animation', () => {
    const svg = buildDemoSvg()
    // The master timeline duration is encoded as an attribute we can assert on.
    expect(svg).toContain('dur="12s"')
  })
})
