import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fileURLToPath } from 'node:url'

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  getProfileConfig: vi.fn().mockReturnValue(undefined),
}))
// Replace the stdio transport so run() doesn't block on a real socket.
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    async start() {}
    async send() {}
    async close() {}
  },
}))
// Wrap (never replace) buildServer and makeExec: run() still drives the REAL
// catalog/selection logic, while tests observe the resolved tool set and the
// executor options it was configured with.
vi.mock('../../../src/lib/mcp/server.js', async (importOriginal) => {
  const mod = await importOriginal()
  return { ...mod, buildServer: vi.fn(mod.buildServer) }
})
vi.mock('../../../src/lib/mcp/invoke.js', async (importOriginal) => {
  const mod = await importOriginal()
  return { ...mod, makeExec: vi.fn(mod.makeExec) }
})

const { buildServer } = await import('../../../src/lib/mcp/server.js')
const { makeExec } = await import('../../../src/lib/mcp/invoke.js')
const { default: Cmd, startMcpServer } =
  await import('../../../src/commands/mcp/serve.js')

const config = {
  name: '@wavyx/pdcli',
  version: '0.18.0',
  commands: [
    {
      id: 'deal:list',
      pluginName: '@wavyx/pdcli',
      summary: 'List',
      flags: {},
      args: {},
    },
    {
      id: 'deal:delete',
      pluginName: '@wavyx/pdcli',
      summary: 'Delete',
      flags: { yes: { type: 'boolean' } },
      args: { id: { required: true } },
    },
    {
      id: 'webhook:list',
      pluginName: '@wavyx/pdcli',
      summary: 'List webhooks',
      flags: {},
      args: {},
    },
    // foreign plugin command — must be filtered out:
    {
      id: 'plugins:install',
      pluginName: '@oclif/plugin-plugins',
      summary: 'Install',
      flags: {},
      args: {},
    },
  ],
}

const okExec = async () => ({ stdout: '[]', stderr: '', code: 0 })

describe('startMcpServer', () => {
  it('builds a curated read-only server and connects, logging the tool count', async () => {
    const connect = vi.fn().mockResolvedValue()
    const log = vi.fn()
    const { tools } = await startMcpServer({
      config,
      allowWrites: false,
      allTools: false,
      topics: [],
      exec: okExec,
      connect,
      log,
    })
    // webhook:list is readable but not curated; plugins:install is foreign.
    expect(tools.map((t) => t.id)).toEqual(['deal:list'])
    expect(connect).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('read-only'))
  })

  it('exposes destructive tools when allTools + allowWrites are set', async () => {
    const log = vi.fn()
    const { tools } = await startMcpServer({
      config,
      allowWrites: true,
      allTools: true,
      topics: [],
      exec: okExec,
      connect: vi.fn().mockResolvedValue(),
      log,
    })
    expect(tools.map((t) => t.id).sort()).toEqual([
      'deal:delete',
      'deal:list',
      'webhook:list',
    ])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('writes enabled'))
  })

  it('scopes to topics', async () => {
    const { tools } = await startMcpServer({
      config,
      allowWrites: false,
      allTools: false,
      topics: ['webhook'],
      exec: okExec,
      connect: vi.fn().mockResolvedValue(),
    })
    expect(tools.map((t) => t.id)).toEqual(['webhook:list'])
  })

  it('tolerates a missing log callback', async () => {
    await expect(
      startMcpServer({
        config,
        allowWrites: false,
        allTools: false,
        topics: [],
        exec: okExec,
        connect: vi.fn().mockResolvedValue(),
      }),
    ).resolves.toBeDefined()
  })
})

// run() loads the REAL oclif config (every command under src/commands), so
// these tests observe the actual tool set each flag combination resolves to.
// Cmd.run needs the repo root: without it oclif loads @oclif/core's own
// (command-less) package and the server would silently build with 0 tools.
describe('mcp serve (run)', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url))
  const run = (argv) => Cmd.run(argv, root)
  let stderrSpy
  beforeEach(() => {
    vi.clearAllMocks()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => stderrSpy.mockRestore())

  const lastTools = () => buildServer.mock.results.at(-1).value.tools
  const stderrText = () => stderrSpy.mock.calls.map((c) => c[0]).join('')

  it('defaults to the 45-tool curated read-only set', async () => {
    await run([])
    const tools = lastTools()
    expect(tools).toHaveLength(45)
    expect(tools.every((t) => t.kind === 'read')).toBe(true)
    expect(stderrText()).toContain('45 tools (read-only)')
  })

  it('adds the 14 curated writes with --allow-writes (59 tools)', async () => {
    await run(['--allow-writes'])
    const tools = lastTools()
    expect(tools).toHaveLength(59)
    expect(tools.filter((t) => t.kind === 'write')).toHaveLength(14)
    expect(stderrText()).toContain('59 tools (writes enabled)')
  })

  it('scopes --topics to those topics, still read-only by default', async () => {
    await run(['--topics', 'deal, person'])
    const tools = lastTools()
    const ids = tools.map((t) => t.id)
    expect(ids).toContain('deal:list')
    expect(ids).toContain('person:list')
    expect(
      tools.every((t) => ['deal', 'person'].includes(t.id.split(':')[0])),
    ).toBe(true)
    expect(tools.every((t) => t.kind === 'read')).toBe(true)
  })

  it('exposes no write or destructive tool without --allow-writes, even with --all-tools', async () => {
    await run(['--all-tools'])
    const tools = lastTools()
    expect(tools.length).toBeGreaterThan(45)
    expect(tools.every((t) => t.kind === 'read')).toBe(true)
  })

  it('gates file:download (host-file overwrite) behind --allow-writes', async () => {
    await run(['--topics', 'file'])
    expect(lastTools().map((t) => t.id)).not.toContain('file:download')
    await run(['--all-tools'])
    expect(lastTools().map((t) => t.id)).not.toContain('file:download')
    await run(['--topics', 'file', '--allow-writes'])
    expect(lastTools().map((t) => t.id)).toContain('file:download')
  })

  it('configures the executor with the 120s default tool timeout', async () => {
    await run([])
    expect(makeExec).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 120_000 }),
    )
  })

  it('wires --tool-timeout through to the executor', async () => {
    await run(['--tool-timeout', '30'])
    expect(makeExec).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 30_000 }),
    )
  })
})
