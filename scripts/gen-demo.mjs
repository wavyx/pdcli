// Generates docs/demo.svg — a self-contained, animated SVG terminal that types
// two real pdcli commands and reveals their output, on a ~12s loop.
//
// Constraints (so it renders inside a GitHub README <img>):
//   - SMIL <animate> only — no <script>, no <foreignObject>, no external
//     fonts/CSS. The only URL is the SVG namespace.
//   - Deterministic: never reads the clock or uses randomness, so re-running
//     the generator produces a byte-identical file (clean diffs in CI).
//
// Content mirrors the homepage hero (website/src/components/Home.astro): the
// "pipeline health" report and the "deal update … --status won" confirmation.
//
// Run via `npm run docs:demo`. Do not hand-edit docs/demo.svg.
import { writeFileSync, mkdirSync } from 'node:fs'

// The SVG namespace URI is literally http://www.w3.org/2000/svg — it is an
// identifier, not a fetched resource, and is required for the doc to be valid.
const SVG_NS = 'http://www.w3.org/2000/svg'

/** Escape the five XML-significant characters. `&` first to avoid doubling. */
export function escapeXml(s) {
  if (s === null || s === undefined) return ''
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

// Each scene: a command that types out, then its rendered output lines.
// A `cls` per line maps to a fill colour class defined once in <style>.
export const SCRIPT = [
  {
    cmd: 'pdcli pipeline health',
    out: [
      { t: '┌ SALES PIPELINE ───────────────── Q2 ┐', cls: 'dim' },
      { t: 'Qualified     18 deals    €142,000', cls: 'fg' },
      { t: 'Contact       11 deals    € 98,500', cls: 'fg' },
      { t: 'Proposal       7 deals    € 76,200', cls: 'fg' },
      { t: 'Negotiation    4 deals    € 51,000', cls: 'fg' },
      { t: '─────────────────────────────────────', cls: 'dim' },
      { t: 'weighted forecast          €221,480', cls: 'ok' },
      { t: 'win rate 32% · avg cycle 24d', cls: 'dim' },
    ],
  },
  {
    cmd: 'pdcli deal update 4821 --status won',
    out: [{ t: '✓ Acme renewal → Won · activity logged', cls: 'ok' }],
  },
]

// Layout constants (px). Monospace metrics keep the typing reveal aligned.
const WIDTH = 720
const PAD = 22
const BAR_H = 40
const CH = 8.4 // advance width of one monospace glyph at 14px
const LINE_H = 22
const PROMPT = '❯ '
const FONT_STACK =
  "'SFMono-Regular', 'JetBrains Mono', 'Fira Code', Consolas, ui-monospace, monospace"

// Per-scene timing (seconds). Two scenes → ~12s total loop.
const SCENE = 6
const TYPE = 1.6 // time spent typing the command
const TOTAL = SCENE * SCRIPT.length // 12s

/** Build one scene as a <g> with SMIL reveal animations. */
function renderScene(scene, index) {
  const begin = index * SCENE
  const cmd = scene.cmd
  const cmdChars = cmd.length
  // Body baseline for the command line, then one row per output line.
  const cmdY = BAR_H + PAD + LINE_H
  const promptW = PROMPT.length * CH
  const cmdW = cmdChars * CH

  // Typing reveal: a clip rect whose width grows from 0 to the command width.
  const clipId = `type${index}`
  const typing = `<clipPath id="${clipId}"><rect x="${PAD}" y="${cmdY - LINE_H}" height="${LINE_H}" width="0"><animate attributeName="width" begin="${begin}s" dur="${TYPE}s" from="0" to="${cmdW}" fill="freeze" repeatCount="1"/><set attributeName="width" to="0" begin="${begin + SCENE}s"/></rect></clipPath>`

  // The command text, clipped so it appears to type left-to-right.
  const cmdText = `<text x="${PAD + promptW}" y="${cmdY}" class="cmd" clip-path="url(#${clipId})">${escapeXml(cmd)}</text>`

  // Caret sits at the end of the typed text, blinking only during this scene.
  const caretX = PAD + promptW + cmdW
  const caret = `<rect x="${caretX}" y="${cmdY - 14}" width="${CH}" height="16" class="cur" opacity="0"><animate attributeName="opacity" values="0;1" begin="${begin}s" dur="0.01s" fill="freeze"/><animate attributeName="opacity" values="1;0" begin="${begin + SCENE - 0.2}s" dur="0.01s" fill="freeze"/><animate attributeName="opacity" values="1;0;1" begin="${begin + TYPE}s" dur="0.8s" repeatCount="indefinite"/></rect>`

  // Prompt glyph, always visible while the scene is on screen.
  const prompt = `<text x="${PAD}" y="${cmdY}" class="prompt">${escapeXml(PROMPT)}</text>`

  // Output lines fade in together once typing finishes.
  let lines = ''
  scene.out.forEach((ln, i) => {
    const y = cmdY + (i + 2) * LINE_H
    lines += `<text x="${PAD}" y="${y}" class="${ln.cls}">${escapeXml(ln.t)}</text>`
  })
  const outGroup = `<g opacity="0">${lines}<animate attributeName="opacity" values="0;1" begin="${begin + TYPE + 0.2}s" dur="0.3s" fill="freeze"/><set attributeName="opacity" to="0" begin="${begin + SCENE}s"/></g>`

  // The whole scene is hidden outside its window; it pops on at `begin`,
  // off at `begin + SCENE`. The first scene starts visible at t=0.
  const sceneVisible =
    index === 0
      ? `<set attributeName="opacity" to="0" begin="${begin + SCENE}s"/><set attributeName="opacity" to="1" begin="${TOTAL}s"/>`
      : `<set attributeName="opacity" to="1" begin="${begin}s"/><set attributeName="opacity" to="0" begin="${begin + SCENE}s"/>`

  return `<g opacity="${index === 0 ? 1 : 0}">${typing}${prompt}${cmdText}${caret}${outGroup}${sceneVisible}</g>`
}

/** Build the full demo SVG document as a deterministic string. */
export function buildDemoSvg() {
  // Tall enough for the prompt line + the largest output block.
  const maxLines = Math.max(...SCRIPT.map((s) => s.out.length))
  const height = BAR_H + PAD * 2 + LINE_H * (maxLines + 3)

  const dotColors = ['#ff5f56', '#ffbd2e', '#27c93f']
  const dots = dotColors
    .map(
      (c, i) =>
        `<circle class="dot" cx="${PAD + 6 + i * 20}" cy="${BAR_H / 2}" r="6" fill="${c}"/>`,
    )
    .join('')

  const title = `<text x="${PAD + 78}" y="${BAR_H / 2 + 4}" class="bar">zsh · ~/acme</text>`

  const scenes = SCRIPT.map((s, i) => renderScene(s, i)).join('')

  // The master timeline: a 1x1 marker whose own animation declares the loop
  // duration so the whole document repeats every 12s. (dur="12s")
  const timeline = `<rect x="0" y="0" width="1" height="1" fill="none" opacity="0"><animate attributeName="opacity" values="0;0" dur="${TOTAL}s" repeatCount="indefinite"/></rect>`

  return `<svg xmlns="${SVG_NS}" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="Animated demo of pdcli running pipeline health and a winning deal update">
<style>
text { font-family: ${FONT_STACK}; font-size: 14px; white-space: pre; }
.bar { fill: #6b7d72; font-size: 12px; }
.prompt { fill: #4ade80; }
.cmd { fill: #e6efe9; }
.fg { fill: #cdddd3; }
.dim { fill: #6b7d72; }
.ok { fill: #4ade80; }
.cur { fill: #4ade80; }
</style>
<rect x="0" y="0" width="${WIDTH}" height="${height}" rx="14" fill="#0c1611"/>
<rect x="0" y="0" width="${WIDTH}" height="${BAR_H}" rx="14" fill="#0a120e"/>
<rect x="0" y="${BAR_H - 14}" width="${WIDTH}" height="14" fill="#0a120e"/>
${dots}
${title}
${scenes}
${timeline}
</svg>
`
}

/* CLI entry — guarded so imports stay pure (mirrors gen-commands.mjs). */
const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  mkdirSync(new URL('../docs/', import.meta.url), { recursive: true })
  writeFileSync(new URL('../docs/demo.svg', import.meta.url), buildDemoSvg())
  console.log('Wrote docs/demo.svg')
}
