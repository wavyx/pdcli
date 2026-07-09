import { spawn } from 'node:child_process'

/**
 * Turn a validated tool input into an argv for the pdcli CLI: flags as
 * `--name=value` (so a value can never be reinterpreted as a flag), then a
 * forced `--output=json` and `--yes` (no TTY for confirms), then positional
 * args after a `--` separator (so a value starting with `-` stays a positional).
 * @param {{id: string, args?: object, flags?: object}} entry
 * @param {Record<string, unknown>} input
 * @returns {string[]}
 */
export function toArgv(entry, input) {
  const argv = entry.id.split(':')

  const positionals = []
  for (const name of Object.keys(entry.args || {})) {
    const v = input[name]
    if (v !== undefined && v !== null) positionals.push(String(v))
  }

  for (const [name, flag] of Object.entries(entry.flags || {})) {
    if (name === 'yes' || name === 'resolve-fields') continue // forced below
    const v = input[name]
    if (v === undefined || v === null) continue
    if (flag.type === 'boolean') {
      if (v) argv.push(`--${name}`)
    } else if (Array.isArray(v)) {
      for (const item of v) argv.push(`--${name}=${item}`)
    } else {
      argv.push(`--${name}=${v}`)
    }
  }

  argv.push('--output=json')
  if (entry.flags && 'yes' in entry.flags) argv.push('--yes')
  // Agents should see human-readable custom-field names, not hash keys.
  if (entry.flags && 'resolve-fields' in entry.flags)
    argv.push('--resolve-fields')
  if (positionals.length) argv.push('--', ...positionals)
  return argv
}

function wrap(data) {
  if (Array.isArray(data)) return { results: data }
  if (data && typeof data === 'object') return data
  return { value: data }
}

/**
 * Run a tool by executing the underlying command and shaping its output into an
 * MCP tool result. A non-zero exit OR a signal termination is reported as an
 * error (a signal-killed child must never look like success). On failure the
 * stderr JSON error envelope pdcli emits in machine mode
 * (`{error, message, exitCode, ...}`) becomes the MCP error text.
 * @param {object} entry catalog entry
 * @param {Record<string, unknown>} input
 * @param {(argv: string[]) => Promise<{stdout: string, stderr: string, code: number, signal?: string|null}>} exec
 */
export async function runTool(entry, input, exec) {
  const argv = toArgv(entry, input)
  const { stdout, stderr, code, signal } = await exec(argv)

  if (signal || code !== 0) {
    // Pseudo-signals from makeExec ('output limit exceeded', 'tool timed out
    // after Ns') are already self-describing; only real signals get a prefix.
    const text = signal
      ? signal.startsWith('SIG')
        ? `terminated: ${signal}`
        : signal
      : (stderr || stdout || `exited ${code}`).trim()
    return { content: [{ type: 'text', text }], isError: true }
  }

  const text = stdout.trim()
  const result = { content: [{ type: 'text', text: text || 'OK' }] }
  try {
    result.structuredContent = wrap(JSON.parse(text))
  } catch {
    // Plain-text output (e.g. "Deleted deal 5") — no structured content.
  }
  return result
}

/** A process killed by a signal reports a null exit code; treat that as 0. */
export function normalizeExit(code) {
  return code ?? 0
}

/** Best-effort string for a spawn error. */
export function errMessage(e) {
  return String(e?.message || e)
}

/**
 * Build an executor that spawns the pdcli CLI as a child process. Keeping
 * command output in a child process keeps the parent's stdout (the MCP stdio
 * channel) clean. Guards against hangs (timeout: SIGTERM, escalating to
 * SIGKILL after `grace`) and runaway output on EITHER stream (maxBuffer caps
 * stdout + stderr combined). Both kills resolve with a self-describing
 * pseudo-signal so callers can tell them from a genuine signal death.
 * @param {{command: string, args?: string[], env?: object, timeout?: number, grace?: number, maxBuffer?: number}} options
 */
export function makeExec({
  command,
  args = [],
  env,
  timeout = 120_000,
  grace = 2_000,
  maxBuffer = 16 * 1024 * 1024,
}) {
  return (argv) =>
    new Promise((resolve) => {
      const child = spawn(command, [...args, ...argv], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env ? { ...process.env, ...env } : process.env,
      })
      // Decode in the stream so a multibyte character split across chunk
      // boundaries is never corrupted by per-chunk toString().
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      let stdout = ''
      let stderr = ''
      let limit = false
      let timedOut = false
      let killTimer
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        killTimer = setTimeout(() => child.kill('SIGKILL'), grace)
      }, timeout)
      const guard = () => {
        if (stdout.length + stderr.length > maxBuffer) {
          limit = true
          child.kill('SIGKILL')
        }
      }
      child.stdout.on('data', (d) => {
        stdout += d
        guard()
      })
      child.stderr.on('data', (d) => {
        stderr += d
        guard()
      })
      child.on('error', (e) => {
        clearTimeout(timer)
        clearTimeout(killTimer)
        resolve({ stdout: '', stderr: errMessage(e), code: 1, signal: null })
      })
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        clearTimeout(killTimer)
        resolve({
          stdout,
          stderr,
          code: normalizeExit(code),
          signal: limit
            ? 'output limit exceeded'
            : timedOut
              ? `tool timed out after ${timeout / 1000}s`
              : signal,
        })
      })
    })
}
