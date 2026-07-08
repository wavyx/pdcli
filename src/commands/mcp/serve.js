import { Flags } from '@oclif/core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import BaseCommand from '../../base-command.js'
import { buildServer } from '../../lib/mcp/server.js'
import { makeExec } from '../../lib/mcp/invoke.js'

/**
 * Build and connect an MCP server. Extracted from run() so it can be tested
 * without a real stdio transport.
 * @param {object} o
 * @param {{name: string, commands: Array, version: string}} o.config
 * @param {boolean} o.allowWrites
 * @param {boolean} o.allTools
 * @param {string[]} o.topics
 * @param {Function} o.exec executor for tool calls
 * @param {(server: object) => Promise<void>} o.connect transport connector
 * @param {(msg: string) => void} [o.log] startup logger (stderr)
 */
export async function startMcpServer({
  config,
  allowWrites,
  allTools,
  topics,
  exec,
  connect,
  log,
}) {
  // Only expose pdcli's own commands as tools — never bundled oclif plugin
  // commands (plugins:*, help, autocomplete).
  const commands = config.commands.filter((c) => c.pluginName === config.name)
  const { server, tools } = buildServer({
    commands,
    version: config.version,
    allowWrites,
    allTools,
    topics,
    exec,
  })
  log?.(
    `pdcli MCP server ready — ${tools.length} tools` +
      (allowWrites ? ' (writes enabled)' : ' (read-only)'),
  )
  await connect(server)
  return { server, tools }
}

export default class MCPServeCommand extends BaseCommand {
  static summary =
    'Run pdcli as a Model Context Protocol (MCP) server over stdio'

  static description = `Run pdcli as a Model Context Protocol (MCP) server over stdio.

Exposes a curated set of core Pipedrive tools (entity reads, search, deal
intelligence, metrics and analytics). Mutating tools are hidden unless
--allow-writes is set; --topics or --all-tools widen the tool set. Each tool
call re-invokes pdcli as a child process under the active auth profile.

Register with Claude Code:
  claude mcp add pipedrive -- pdcli mcp serve

Or in .mcp.json:
  {"mcpServers":{"pipedrive":{"command":"pdcli","args":["mcp","serve"]}}}`

  static skipAuth = true // children authenticate

  static examples = [
    '<%= config.bin %> mcp serve',
    '<%= config.bin %> mcp serve --allow-writes',
    '<%= config.bin %> mcp serve --topics deal,person,org',
    '<%= config.bin %> mcp serve --all-tools --allow-writes',
  ]

  // A long-running server has no use for the output-shaping global flags; keep
  // only --profile (which auth profile the tools run under).
  static baseFlags = { profile: BaseCommand.baseFlags.profile }

  static flags = {
    'allow-writes': Flags.boolean({
      description:
        'Expose mutating tools (create/update/delete/merge/bulk). Off by default — read-only.',
      default: false,
    }),
    'all-tools': Flags.boolean({
      description:
        'Expose every command as a tool instead of the curated core set',
      default: false,
    }),
    topics: Flags.string({
      description:
        'Comma-separated topics to expose (e.g. deal,person) instead of the curated set',
    }),
  }

  async run() {
    const { flags } = await this.parse(MCPServeCommand)
    // Each tool call re-invokes this same CLI as a child process, keeping the
    // parent's stdout (the MCP stdio channel) free of command output. Forward
    // the active profile so tools run under the same account as the server.
    const exec = makeExec({
      command: process.execPath,
      args: [process.argv[1]],
      env: { PDCLI_PROFILE: this.activeProfile },
    })
    await startMcpServer({
      config: this.config,
      allowWrites: flags['allow-writes'],
      allTools: flags['all-tools'],
      topics: (flags.topics || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      exec,
      connect: (server) => server.connect(new StdioServerTransport()),
      log: (msg) => process.stderr.write(msg + '\n'),
    })
  }
}
