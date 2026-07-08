import { describe, it, expect, vi } from 'vitest'
import { runCmd } from '../../helpers.js'

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

describe('mcp serve (run)', () => {
  it('parses flags and connects a stdio server', async () => {
    // Should resolve (not hang) thanks to the mocked transport.
    await expect(runCmd(Cmd, ['--allow-writes'])).resolves.toBeDefined()
  })

  it('accepts --topics and --all-tools', async () => {
    await expect(
      runCmd(Cmd, ['--topics', 'deal, person']),
    ).resolves.toBeDefined()
    await expect(runCmd(Cmd, ['--all-tools'])).resolves.toBeDefined()
  })
})
