// Generates the command reference from the built oclif manifest:
//   - docs/commands.md (GitHub-facing)
// Run via `npm run docs:commands` (after `npm run build`). Do not hand-edit output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const BIN = 'pdcli'

export function groupByTopic(manifest) {
  const commands = Object.values(manifest.commands)
    .filter((c) => !c.hidden)
    .sort((a, b) => a.id.localeCompare(b.id))
  const byTopic = {}
  for (const c of commands) {
    const topic = c.id.includes(':') ? c.id.split(':')[0] : '_root'
    ;(byTopic[topic] ??= []).push(c)
  }
  return { commands, byTopic }
}

const nonGlobalFlags = (c) =>
  Object.entries(c.flags || {}).filter(([, f]) => f.helpGroup !== 'GLOBAL')

const argString = (c) =>
  Object.entries(c.args || {})
    .map(([name, a]) => (a.required ? ` <${name}>` : ` [${name}]`))
    .join('')

const exampleText = (e) =>
  (typeof e === 'string' ? e : e.command || '').replaceAll(
    '<%= config.bin %>',
    BIN,
  )

const flagLine = (name, f) => {
  const alias = f.char ? `-${f.char}, ` : ''
  const value =
    f.type === 'option' ? ` <${(f.options || []).join('|') || 'value'}>` : ''
  const required = f.required ? ' _(required)_' : ''
  return `- \`${alias}--${name}${value}\`${required} — ${f.description || ''}`.trimEnd()
}

export function renderGithubMarkdown(manifest, bin = BIN) {
  const { commands, byTopic } = groupByTopic(manifest)
  let out = `---
title: Commands
description: Full command reference for the pdcli command-line interface.
---

<!-- AUTO-GENERATED from the oclif manifest by scripts/gen-commands.mjs — do not edit by hand. -->

Reference for \`${bin}\` v${manifest.version} (${commands.length} commands). Every command also accepts the global flags \`--output table|json\`, \`--profile\`, \`--no-color\`, \`--verbose\`, \`--no-retry\`, \`--timeout\`, and \`--limit\`.

`
  for (const topic of Object.keys(byTopic).sort()) {
    out += `## ${topic === '_root' ? 'Top-level' : `${bin} ${topic}`}\n\n`
    for (const c of byTopic[topic]) {
      const cmd = c.id.replaceAll(':', ' ')
      out += `### \`${bin} ${cmd}\`\n\n`
      if (c.description) out += `${c.description}\n\n`
      out += '```\n' + `${bin} ${cmd}${argString(c)} [flags]` + '\n```\n\n'
      const flags = nonGlobalFlags(c)
      if (flags.length)
        out += flags.map(([n, f]) => flagLine(n, f)).join('\n') + '\n\n'
      const examples = (c.examples || []).map(exampleText).filter(Boolean)
      if (examples.length)
        out += 'Examples:\n\n```bash\n' + examples.join('\n') + '\n```\n\n'
    }
  }
  return out
}

/* CLI entry — guarded so imports stay pure */
const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  const manifest = JSON.parse(
    readFileSync(new URL('../oclif.manifest.json', import.meta.url)),
  )
  mkdirSync(new URL('../docs/', import.meta.url), { recursive: true })
  writeFileSync(
    new URL('../docs/commands.md', import.meta.url),
    renderGithubMarkdown(manifest),
  )
  const count = groupByTopic(manifest).commands.length
  console.log(`Wrote docs/commands.md — ${count} commands`)
}
