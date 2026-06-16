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
const FONT_SIZE = 15
const WIDTH = 880 // roomy terminal width so no output line crowds the edge
const PAD = 26
const BAR_H = 44
// Glyph advance used to size the typing clip + caret. Deliberately a slight
// OVER-estimate of a 15px monospace advance: the clip must be at least as wide
// as the real text or it crops the command (e.g. "health" → "heal"). Erring
// wide just floats the caret a hair past the text on narrow fonts — harmless.
const CH = 10.0
const LINE_H = 26
const PROMPT = '❯ '
const FONT_STACK =
  "'SFMono-Regular', 'JetBrains Mono', 'Fira Code', Consolas, ui-monospace, monospace"

// Per-scene timing (seconds). The demo plays through each scene once, ~6s each.
const SCENE = 6
const TYPE = 1.6 // time spent typing the command

/** Build one scene as a <g> with SMIL reveal animations. */
function renderScene(scene, index) {
  const begin = index * SCENE
  // The demo plays once and rests on the LAST scene (robust across renderers —
  // no looping state to degenerate). So the last scene never resets/hides.
  const isLast = index === SCRIPT.length - 1
  const cmd = scene.cmd
  const cmdChars = cmd.length
  // Body baseline for the command line, then one row per output line.
  const cmdY = BAR_H + PAD + LINE_H
  const promptW = PROMPT.length * CH
  const cmdW = cmdChars * CH

  // Typing reveal: a clip rect whose width grows from 0 to the command width.
  const clipId = `type${index}`
  const clipReset = isLast
    ? ''
    : `<set attributeName="width" to="0" begin="${begin + SCENE}s"/>`
  // Clip height runs from above the cap line to BELOW the baseline so glyph
  // descenders (the tails of p/g/y) aren't sheared off — the rect's bottom must
  // clear the baseline (cmdY), not sit on it.
  const clipTop = cmdY - LINE_H
  const clipH = LINE_H + 10
  const typing = `<clipPath id="${clipId}"><rect x="${PAD}" y="${clipTop}" height="${clipH}" width="0"><animate attributeName="width" begin="${begin}s" dur="${TYPE}s" from="0" to="${cmdW}" fill="freeze" repeatCount="1"/>${clipReset}</rect></clipPath>`

  // The command text, clipped so it appears to type left-to-right.
  const cmdText = `<text x="${PAD + promptW}" y="${cmdY}" class="cmd" clip-path="url(#${clipId})">${escapeXml(cmd)}</text>`

  // Caret sits at the end of the typed text, blinking only during this scene.
  const caretX = PAD + promptW + cmdW
  // Last scene's caret keeps blinking on the resting frame; earlier scenes
  // switch off at scene end (their whole group also fades out then).
  const caretOff = isLast
    ? ''
    : `<animate attributeName="opacity" values="1;0" begin="${begin + SCENE - 0.2}s" dur="0.01s" fill="freeze"/>`
  const caret = `<rect x="${caretX}" y="${cmdY - FONT_SIZE}" width="${CH}" height="${FONT_SIZE + 3}" class="cur" opacity="0"><animate attributeName="opacity" values="0;1" begin="${begin}s" dur="0.01s" fill="freeze"/>${caretOff}<animate attributeName="opacity" values="1;0;1" begin="${begin + TYPE}s" dur="0.8s" repeatCount="indefinite"/></rect>`

  // Prompt glyph, always visible while the scene is on screen.
  const prompt = `<text x="${PAD}" y="${cmdY}" class="prompt">${escapeXml(PROMPT)}</text>`

  // Output lines fade in together once typing finishes.
  let lines = ''
  scene.out.forEach((ln, i) => {
    const y = cmdY + (i + 2) * LINE_H
    lines += `<text x="${PAD}" y="${y}" class="${ln.cls}">${escapeXml(ln.t)}</text>`
  })
  const outHide = isLast
    ? ''
    : `<set attributeName="opacity" to="0" begin="${begin + SCENE}s"/>`
  const outGroup = `<g opacity="0">${lines}<animate attributeName="opacity" values="0;1" begin="${begin + TYPE + 0.2}s" dur="0.3s" fill="freeze"/>${outHide}</g>`

  // Play-once sequence: scene 0 is visible from t=0 and hides when scene 1
  // begins; the last scene appears at its `begin` and stays (rests). No reshow,
  // so there's no loop state for a renderer to land on mid-degeneration.
  let sceneVisible
  if (isLast) {
    sceneVisible =
      index === 0
        ? ''
        : `<set attributeName="opacity" to="1" begin="${begin}s"/>`
  } else if (index === 0) {
    sceneVisible = `<set attributeName="opacity" to="0" begin="${begin + SCENE}s"/>`
  } else {
    sceneVisible = `<set attributeName="opacity" to="1" begin="${begin}s"/><set attributeName="opacity" to="0" begin="${begin + SCENE}s"/>`
  }

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

  return `<svg xmlns="${SVG_NS}" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="Animated demo of pdcli running pipeline health and a winning deal update">
<style>
text { font-family: ${FONT_STACK}; font-size: ${FONT_SIZE}px; white-space: pre; }
.bar { fill: #6b7d72; font-size: 13px; }
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
