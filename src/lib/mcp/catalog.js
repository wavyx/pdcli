/**
 * Maps oclif commands to an MCP tool catalog, classifying each by how much it
 * can mutate so the server can gate writes behind `--allow-writes`, and
 * curating the default tool set (145 commands would degrade MCP hosts).
 */

// Commands never exposed as MCP tools:
// - `api` is an arbitrary-request escape hatch that bypasses per-tool gating.
// - `backup` / `sync:warehouse` are long-running full exports that write files.
// - `changes` advances a persistent watermark — a stateful side effect an
//   agent poll would silently consume.
// - `doctor` is a local-environment diagnostic, not useful to an agent.
// - `watch` is a long-running stream that doesn't fit request/response.
// `backup:diff` stays: it is a zero-API local read.
export const EXCLUDED = new Set([
  'api',
  'backup',
  'changes',
  'doctor',
  'sync:warehouse',
  'watch',
])

// Topics excluded by prefix so future subcommands stay out: `auth:*` manage
// the operator's LOCAL credentials, `mcp:*` is this server itself, and
// `alias:*` / `config:*` / `profile:*` manage LOCAL operator state (aliases,
// CLI config, active profile) — exposing them would let an agent booby-trap
// the operator's own CLI, not touch CRM data.
const EXCLUDED_PREFIXES = ['auth:', 'mcp:', 'alias:', 'config:', 'profile:']

/**
 * @param {string} id oclif command id
 */
export function isExcluded(id) {
  return EXCLUDED.has(id) || EXCLUDED_PREFIXES.some((p) => id.startsWith(p))
}

/**
 * Per-id classification overrides, checked before any leaf-verb set.
 * `file:download` only reads the CRM, but its `--out` flag can overwrite an
 * arbitrary existing file on the operator's host with CRM bytes — local
 * destruction, so it must never ship in a read-only tool set.
 * @type {Map<string, 'read'|'write'|'destructive'>}
 */
export const KIND_OVERRIDES = new Map([['file:download', 'destructive']])

// Leaf verbs that never mutate remote or local state. A read-leaf command
// that CAN mutate must be pinned in KIND_OVERRIDES instead.
export const READ_LEAVES = new Set([
  'list',
  'get',
  'search',
  'find',
  'status',
  'current',
  'history',
  'summary',
  'context',
  'diff',
  'me',
  'health',
  'scorecard',
  'velocity',
  'aging',
  'slippage',
  'coverage',
  'forecast',
  'conversion-matrix',
  'version',
])

// Read-only analytics command ids whose leaf is not a shared verb.
export const READ_IDS = new Set([
  'audit',
  'audit:stage-skips',
  'digest',
  'funnel',
  'lookup',
  'quota',
])

// Leaf verbs that mutate (documented for the audit test; classifyKind treats
// any verb that is neither read nor destructive as a gated write anyway).
export const WRITE_LEAVES = new Set([
  'create',
  'update',
  'set',
  'add',
  'upload',
  'import',
  'upsert',
  'use',
  'remote-link',
])

// Leaf verbs that destroy or irreversibly reshape data: merge collapses two
// records, convert is lossy (deal→lead drops data), bulk-update mass-mutates.
export const DESTRUCTIVE_LEAVES = new Set([
  'delete',
  'remove',
  'unset',
  'merge',
  'convert',
  'bulk-update',
])

/**
 * @param {string} id oclif command id (e.g. `deal:product:remove`)
 * @returns {'read'|'write'|'destructive'}
 */
export function classifyKind(id) {
  const override = KIND_OVERRIDES.get(id)
  if (override) return override
  const leaf = id.split(':').pop()
  if (DESTRUCTIVE_LEAVES.has(leaf)) return 'destructive'
  if (READ_IDS.has(id) || READ_LEAVES.has(leaf)) return 'read'
  // WRITE_LEAVES — and any unaudited future verb: mutation is the safe default.
  return 'write'
}

// The default tool set: core CRM reads plus the write primitives an agent
// actually needs, small enough not to degrade MCP hosts. Everything else is
// reachable via `--topics` or `--all-tools`. Locked by tests — audit any edit.
export const CURATED = new Set([
  // reads — core entity list/get
  'activity:get',
  'activity:list',
  'deal:get',
  'deal:list',
  'field:get',
  'field:list',
  'filter:get',
  'filter:list',
  'goal:list',
  'lead:get',
  'lead:list',
  'note:get',
  'note:list',
  'org:get',
  'org:list',
  'person:get',
  'person:list',
  'pipeline:get',
  'pipeline:list',
  'product:get',
  'product:list',
  'project:get',
  'project:list',
  'stage:get',
  'stage:list',
  'task:get',
  'task:list',
  'user:find',
  'user:list',
  // reads — search + deal intelligence
  'search',
  'deal:context',
  'deal:history',
  'deal:summary',
  // reads — metrics + analytics
  'metrics:aging',
  'metrics:conversion-matrix',
  'metrics:coverage',
  'metrics:forecast',
  'metrics:slippage',
  'metrics:velocity',
  'audit',
  'digest',
  'funnel',
  'pipeline:health',
  'rep:scorecard',
  'user:me',
  // writes — only exposed under --allow-writes
  'activity:create',
  'activity:update',
  'deal:create',
  'deal:product:add',
  'deal:update',
  'deal:upsert',
  'note:create',
  'note:update',
  'org:create',
  'org:update',
  'org:upsert',
  'person:create',
  'person:update',
  'person:upsert',
])

/** Turn a command id into a valid MCP tool name. */
export function toolName(id) {
  return id.replace(/[:-]/g, '_')
}

/**
 * Build the tool catalog from a list of oclif command descriptors.
 * @param {Array<{id: string, summary?: string, description?: string, hidden?: boolean, flags?: object, args?: object}>} commands
 */
export function buildCatalog(commands) {
  return commands
    .filter((c) => !c.hidden && !isExcluded(c.id))
    .map((c) => ({
      id: c.id,
      toolName: toolName(c.id),
      summary: c.summary || c.description || c.id,
      kind: classifyKind(c.id),
      args: c.args || {},
      flags: c.flags || {},
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}
