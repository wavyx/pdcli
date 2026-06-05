import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../src/lib/aliases.js', () => ({
  getAlias: vi.fn(),
}))

const { getAlias } = await import('../../src/lib/aliases.js')
const { default: hook } = await import('../../src/hooks/command-not-found.js')

class ExitSignal {
  constructor(code) {
    this.code = code
    this.exitCode = code
    this.isExitSignal = true
  }
}

describe('command-not-found hook', () => {
  let origExit
  let exitCalls
  let stderrSpy

  beforeEach(() => {
    origExit = process.exit
    exitCalls = []
    process.exit = vi.fn((code) => {
      exitCalls.push(code)
      throw new ExitSignal(code)
    })
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    getAlias.mockReset()
  })

  afterEach(() => {
    process.exit = origExit
    vi.restoreAllMocks()
  })

  it('expands alias and runs command, then exits 0', async () => {
    getAlias.mockReturnValue('deal list --limit 5')
    const runCommand = vi.fn().mockResolvedValue(undefined)
    const findCommand = vi.fn((id) => (id === 'deal:list' ? {} : null))

    await expect(
      hook({
        id: 'wd',
        argv: [],
        config: { runCommand, findCommand },
      }),
    ).rejects.toBeInstanceOf(ExitSignal)

    expect(runCommand).toHaveBeenCalledWith('deal:list', ['--limit', '5'])
    expect(exitCalls).toContain(0)
  })

  it('resolves topic + subcommand to colon-separated command id', async () => {
    getAlias.mockReturnValue('deal list')
    const runCommand = vi.fn().mockResolvedValue(undefined)
    const findCommand = vi.fn((id) => (id === 'deal:list' ? {} : null))

    await expect(
      hook({
        id: 'wd',
        argv: [],
        config: { runCommand, findCommand },
      }),
    ).rejects.toBeInstanceOf(ExitSignal)

    expect(runCommand).toHaveBeenCalledWith('deal:list', [])
    expect(exitCalls).toContain(0)
  })

  it('appends extra argv from invocation to alias-expanded argv', async () => {
    getAlias.mockReturnValue('deal list')
    const runCommand = vi.fn().mockResolvedValue(undefined)
    const findCommand = vi.fn((id) => (id === 'deal:list' ? {} : null))

    await expect(
      hook({
        id: 'wd',
        argv: ['--status', 'won'],
        config: { runCommand, findCommand },
      }),
    ).rejects.toBeInstanceOf(ExitSignal)

    expect(runCommand).toHaveBeenCalledWith('deal:list', ['--status', 'won'])
    expect(exitCalls).toContain(0)
  })

  it('treats single-word alias as a flat command id', async () => {
    getAlias.mockReturnValue('version')
    const runCommand = vi.fn().mockResolvedValue(undefined)
    const findCommand = vi.fn(() => null)

    await expect(
      hook({
        id: 'v',
        argv: [],
        config: { runCommand, findCommand },
      }),
    ).rejects.toBeInstanceOf(ExitSignal)

    expect(runCommand).toHaveBeenCalledWith('version', [])
    expect(exitCalls).toContain(0)
  })

  it('exits with err.exitCode when runCommand fails', async () => {
    getAlias.mockReturnValue('deal list')
    const err = new Error('boom')
    err.exitCode = 42
    const runCommand = vi.fn().mockRejectedValue(err)
    const findCommand = vi.fn((id) => (id === 'deal:list' ? {} : null))

    await expect(
      hook({
        id: 'wd',
        argv: [],
        config: { runCommand, findCommand },
      }),
    ).rejects.toBeInstanceOf(ExitSignal)

    expect(exitCalls[0]).toBe(42)
  })

  it('defaults exit code to 1 when err has no exitCode', async () => {
    getAlias.mockReturnValue('deal list')
    const runCommand = vi.fn().mockRejectedValue(new Error('boom'))
    const findCommand = vi.fn((id) => (id === 'deal:list' ? {} : null))

    await expect(
      hook({
        id: 'wd',
        argv: [],
        config: { runCommand, findCommand },
      }),
    ).rejects.toBeInstanceOf(ExitSignal)

    expect(exitCalls[0]).toBe(1)
  })

  it('writes error to stderr and exits 127 when no alias matches', async () => {
    getAlias.mockReturnValue(undefined)
    const runCommand = vi.fn()
    const findCommand = vi.fn()

    await expect(
      hook({
        id: 'bogus',
        argv: [],
        config: { runCommand, findCommand },
      }),
    ).rejects.toBeInstanceOf(ExitSignal)

    expect(runCommand).not.toHaveBeenCalled()
    expect(exitCalls[0]).toBe(127)
    const writes = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(writes).toContain('bogus')
    expect(writes).toContain('is not a pdcli command')
    expect(writes).toContain('pdcli help')
    expect(writes).toContain('pdcli alias list')
  })

  it('handles missing options.argv (undefined) gracefully', async () => {
    getAlias.mockReturnValue('deal list')
    const runCommand = vi.fn().mockResolvedValue(undefined)
    const findCommand = vi.fn((id) => (id === 'deal:list' ? {} : null))

    await expect(
      hook({
        id: 'wd',
        config: { runCommand, findCommand },
      }),
    ).rejects.toBeInstanceOf(ExitSignal)

    expect(runCommand).toHaveBeenCalledWith('deal:list', [])
    expect(exitCalls).toContain(0)
  })
})
