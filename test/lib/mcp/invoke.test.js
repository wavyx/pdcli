import { describe, it, expect, vi } from 'vitest'
import {
  toArgv,
  runTool,
  makeExec,
  normalizeExit,
  errMessage,
  scheduleHardKill,
} from '../../../src/lib/mcp/invoke.js'

const readEntry = {
  id: 'deal:list',
  flags: {
    status: { type: 'option', options: ['open', 'won', 'lost'] },
    include: { type: 'option', multiple: true },
    'exact-match': { type: 'boolean' },
  },
  args: {},
}
const writeEntry = {
  id: 'deal:product:remove',
  flags: { yes: { type: 'boolean' } },
  args: { id: { required: true } },
}

describe('toArgv', () => {
  it('splits the id into a command path and forces --output=json', () => {
    const argv = toArgv(readEntry, { status: 'open' })
    expect(argv.slice(0, 2)).toEqual(['deal', 'list'])
    expect(argv).toContain('--status=open')
    expect(argv).toContain('--output=json')
  })

  it('emits flag values as --name=value so they cannot be read as flags', () => {
    // A value starting with `-` must not become a CLI flag.
    const argv = toArgv(readEntry, { status: '--help' })
    expect(argv).toContain('--status=--help')
    expect(argv).not.toContain('--help')
  })

  it('puts positional args after a -- separator', () => {
    // An arg value starting with `-` must stay a positional.
    const argv = toArgv(
      { id: 'deal:get', flags: {}, args: { id: {} } },
      { id: '--help' },
    )
    const sep = argv.indexOf('--')
    expect(sep).toBeGreaterThan(-1)
    expect(argv.slice(sep + 1)).toEqual(['--help'])
  })

  it('emits a boolean flag only when true', () => {
    expect(toArgv(readEntry, { 'exact-match': true })).toContain(
      '--exact-match',
    )
    expect(toArgv(readEntry, { 'exact-match': false })).not.toContain(
      '--exact-match',
    )
  })

  it('repeats a multiple flag per value as --name=value', () => {
    const argv = toArgv(readEntry, { include: ['deal', 'person'] })
    expect(argv.filter((a) => a.startsWith('--include='))).toEqual([
      '--include=deal',
      '--include=person',
    ])
  })

  it('passes positional args after -- and auto-appends --yes', () => {
    const argv = toArgv(writeEntry, { id: '42' })
    expect(argv).toEqual([
      'deal',
      'product',
      'remove',
      '--output=json',
      '--yes',
      '--',
      '42',
    ])
  })

  it('injects --resolve-fields when the command supports it', () => {
    // Agents must see human-readable custom-field names, not 40-char hashes.
    const entry = {
      id: 'deal:get',
      flags: { 'resolve-fields': { type: 'boolean' } },
      args: { id: {} },
    }
    const argv = toArgv(entry, { id: '42' })
    expect(argv.filter((a) => a === '--resolve-fields')).toHaveLength(1)
  })

  it('never doubles --resolve-fields when present in the input', () => {
    const entry = {
      id: 'deal:get',
      flags: { 'resolve-fields': { type: 'boolean' } },
      args: {},
    }
    const argv = toArgv(entry, { 'resolve-fields': true })
    expect(argv.filter((a) => a === '--resolve-fields')).toHaveLength(1)
  })

  it('does not inject --resolve-fields when the command lacks it', () => {
    expect(toArgv(readEntry, {})).not.toContain('--resolve-fields')
  })

  it('omits an optional arg that was not provided (no -- separator)', () => {
    const argv = toArgv({ id: 'deal:get', flags: {}, args: { id: {} } }, {})
    expect(argv).toEqual(['deal', 'get', '--output=json'])
  })

  it('tolerates entries with no flags/args maps', () => {
    expect(toArgv({ id: 'deal:list' }, { status: null })).toEqual([
      'deal',
      'list',
      '--output=json',
    ])
  })

  it('skips flags and args explicitly set to null', () => {
    const argv = toArgv(
      {
        id: 'deal:get',
        flags: { status: { type: 'option' } },
        args: { id: {} },
      },
      { id: null, status: null },
    )
    expect(argv).toEqual(['deal', 'get', '--output=json'])
  })
})

describe('runTool', () => {
  const fakeExec = (result) => async () => result

  it('parses a JSON object into structuredContent', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({ stdout: '{"a":1}', stderr: '', code: 0 }),
    )
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent).toEqual({ a: 1 })
    expect(res.content[0].text).toBe('{"a":1}')
  })

  it('wraps a JSON array under results', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({ stdout: '[1,2]', stderr: '', code: 0 }),
    )
    expect(res.structuredContent).toEqual({ results: [1, 2] })
  })

  it('wraps a primitive JSON value under value', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({ stdout: '42', stderr: '', code: 0 }),
    )
    expect(res.structuredContent).toEqual({ value: 42 })
  })

  it('wraps a null JSON value under value', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({ stdout: 'null', stderr: '', code: 0 }),
    )
    expect(res.structuredContent).toEqual({ value: null })
  })

  it('returns plain text with no structuredContent for non-JSON output', async () => {
    const res = await runTool(
      writeEntry,
      { id: '42' },
      fakeExec({ stdout: 'Removed product 42', stderr: '', code: 0 }),
    )
    expect(res.structuredContent).toBeUndefined()
    expect(res.content[0].text).toBe('Removed product 42')
  })

  it('falls back to OK for empty output', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({ stdout: '   ', stderr: '', code: 0 }),
    )
    expect(res.content[0].text).toBe('OK')
  })

  it('surfaces the stderr JSON error envelope on a non-zero exit', async () => {
    // pdcli emits {error,message,exitCode,...} on stderr in machine mode.
    const envelope =
      '{"error":"not_found","message":"Deal 9 not found","exitCode":4}'
    const res = await runTool(
      readEntry,
      {},
      fakeExec({ stdout: '', stderr: envelope, code: 4 }),
    )
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe(envelope)
  })

  it('falls back to stdout when a failed run wrote nothing to stderr', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({ stdout: 'partial failure detail', stderr: '', code: 3 }),
    )
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('partial failure detail')
  })

  it('uses a generic message when a failed run produced no output', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({ stdout: '', stderr: '', code: 5 }),
    )
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('exited 5')
  })

  it('reports a signal-terminated child as an error (not silent success)', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({
        stdout: 'partial output',
        stderr: '',
        code: 0,
        signal: 'SIGKILL',
      }),
    )
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('terminated: SIGKILL')
  })

  it('surfaces a timeout pseudo-signal verbatim, not as a signal kill', async () => {
    const res = await runTool(
      readEntry,
      {},
      fakeExec({
        stdout: '',
        stderr: '',
        code: 0,
        signal: 'tool timed out after 120s',
      }),
    )
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('tool timed out after 120s')
  })
})

describe('makeExec', () => {
  it('captures stdout and a zero exit', async () => {
    const exec = makeExec({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("hi")'],
    })
    const r = await exec([])
    expect(r).toMatchObject({ stdout: 'hi', code: 0 })
  })

  it('captures stderr and a non-zero exit', async () => {
    const exec = makeExec({
      command: process.execPath,
      args: ['-e', 'process.stderr.write("err");process.exit(3)'],
    })
    const r = await exec([])
    expect(r.stderr).toBe('err')
    expect(r.code).toBe(3)
  })

  it('resolves with code 1 when the process cannot be spawned (args default)', async () => {
    const exec = makeExec({ command: 'definitely-not-a-real-binary-xyz' })
    const r = await exec([])
    expect(r.code).toBe(1)
    expect(r.stderr).toBeTruthy()
  })

  it('passes env through to the child', async () => {
    const exec = makeExec({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(process.env.PDCLI_PROFILE||"none")'],
      env: { PDCLI_PROFILE: 'work' },
    })
    expect((await exec([])).stdout).toBe('work')
  })

  it('kills a child that exceeds the timeout with a distinct label', async () => {
    const exec = makeExec({
      command: process.execPath,
      args: ['-e', 'setTimeout(()=>{}, 10000)'],
      timeout: 150,
    })
    expect((await exec([])).signal).toBe('tool timed out after 0.15s')
  })

  // Directly exercises the SIGKILL escalation with fake timers and a fake
  // child, so it is covered on every OS (a real process on Windows dies on the
  // first signal and never reaches the grace escalation).
  it('scheduleHardKill force-kills with SIGKILL after the grace period', () => {
    vi.useFakeTimers()
    try {
      const kills = []
      const child = { kill: (sig) => kills.push(sig) }
      scheduleHardKill(child, 100)
      expect(kills).toEqual([])
      vi.advanceTimersByTime(100)
      expect(kills).toEqual(['SIGKILL'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
    const exec = makeExec({
      command: process.execPath,
      args: ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
      timeout: 150,
      grace: 100,
    })
    expect((await exec([])).signal).toBe('tool timed out after 0.15s')
  })

  it('decodes multibyte output split across chunk boundaries', async () => {
    // 50k 3-byte chars: pipe chunks (64 KiB) are guaranteed to split one.
    const exec = makeExec({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("\\u20ac".repeat(50000))'],
    })
    expect((await exec([])).stdout).toBe('€'.repeat(50000))
  })

  it('kills a child that exceeds maxBuffer', async () => {
    const exec = makeExec({
      command: process.execPath,
      args: [
        '-e',
        'const b="x".repeat(100000); setInterval(()=>process.stdout.write(b), 1)',
      ],
      maxBuffer: 50000,
      timeout: 5000,
    })
    expect((await exec([])).signal).toBe('output limit exceeded')
  })

  it('kills a child that floods stderr past maxBuffer and reports an error', async () => {
    const exec = makeExec({
      command: process.execPath,
      args: [
        '-e',
        'const b="x".repeat(100000); setInterval(()=>process.stderr.write(b), 1)',
      ],
      maxBuffer: 50000,
      timeout: 5000,
    })
    const res = await runTool(readEntry, {}, exec)
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('output limit exceeded')
  })
})

describe('normalizeExit', () => {
  it('passes through a numeric code', () => {
    expect(normalizeExit(3)).toBe(3)
  })
  it('treats a null (signal) code as 0', () => {
    expect(normalizeExit(null)).toBe(0)
  })
})

describe('errMessage', () => {
  it('prefers the error message', () => {
    expect(errMessage(new Error('boom'))).toBe('boom')
  })
  it('falls back to the value itself', () => {
    expect(errMessage('plain')).toBe('plain')
  })
})
