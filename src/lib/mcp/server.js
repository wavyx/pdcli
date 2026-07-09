import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { buildCatalog, CURATED } from './catalog.js'
import { buildInputSchema } from './schema.js'
import { runTool } from './invoke.js'

/**
 * MCP tool annotations derived from a catalog entry's kind. Per the MCP spec
 * `destructiveHint: false` promises additive-only changes — update/upsert
 * overwrite existing values, so every non-read tool carries the hint.
 */
export function annotationsFor(entry) {
  return {
    title: entry.summary,
    readOnlyHint: entry.kind === 'read',
    destructiveHint: entry.kind !== 'read',
    idempotentHint: entry.kind === 'read',
    openWorldHint: true,
  }
}

/**
 * Select the tools to expose. Scope first: explicit `topics` win, then
 * `allTools` (every non-excluded command), else the CURATED core set. Then
 * the write gate: reads always, write/destructive only with `allowWrites`.
 * @param {Array} catalog
 * @param {{allowWrites?: boolean, allTools?: boolean, topics?: string[]}} [options]
 */
export function selectTools(
  catalog,
  { allowWrites = false, allTools = false, topics = [] } = {},
) {
  const scope = topics.length
    ? catalog.filter((e) => topics.includes(e.id.split(':')[0]))
    : allTools
      ? catalog
      : catalog.filter((e) => CURATED.has(e.id))
  return scope.filter((e) => allowWrites || e.kind === 'read')
}

/**
 * Build an McpServer that exposes pdcli commands as tools.
 * @param {object} options
 * @param {Array} options.commands oclif command descriptors
 * @param {string} options.version server version
 * @param {boolean} [options.allowWrites] expose mutating tools
 * @param {boolean} [options.allTools] expose all non-excluded commands
 * @param {string[]} [options.topics] restrict to these topics
 * @param {Function} options.exec executor passed to runTool
 * @returns {{server: McpServer, tools: Array}}
 */
export function buildServer({
  commands,
  version,
  allowWrites,
  allTools,
  topics,
  exec,
}) {
  const server = new McpServer({ name: 'pdcli', version })
  const tools = selectTools(buildCatalog(commands), {
    allowWrites,
    allTools,
    topics,
  })

  for (const entry of tools) {
    server.registerTool(
      entry.toolName,
      {
        title: entry.summary,
        description: entry.summary,
        inputSchema: buildInputSchema(entry),
        annotations: annotationsFor(entry),
      },
      (input) => runTool(entry, input, exec),
    )
  }

  return { server, tools }
}
