import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  classifyKind,
  toolName,
  buildCatalog,
  isExcluded,
  EXCLUDED,
  CURATED,
  KIND_OVERRIDES,
  READ_LEAVES,
  READ_IDS,
  WRITE_LEAVES,
  DESTRUCTIVE_LEAVES,
} from '../../../src/lib/mcp/catalog.js'

describe('classifyKind', () => {
  it.each([
    ['deal:delete', 'destructive'],
    ['deal:product:remove', 'destructive'],
    ['config:unset', 'destructive'],
    ['person:merge', 'destructive'], // collapses two records
    ['deal:convert', 'destructive'], // lossy deal→lead conversion
    ['lead:convert', 'destructive'],
    ['deal:bulk-update', 'destructive'], // mass-mutates many records
    ['deal:create', 'write'],
    ['deal:update', 'write'],
    ['alias:set', 'write'],
    ['deal:follower:add', 'write'],
    ['file:upload', 'write'],
    ['person:import', 'write'],
    ['org:upsert', 'write'],
    ['profile:use', 'write'],
    ['file:remote-link', 'write'],
    ['deal:list', 'read'],
    ['deal:get', 'read'],
    ['search', 'read'],
    ['user:find', 'read'],
    ['profile:current', 'read'],
    ['deal:history', 'read'],
    ['deal:summary', 'read'],
    ['deal:context', 'read'],
    ['backup:diff', 'read'], // zero-API local snapshot diff
    ['user:me', 'read'],
    // override beats the 'download' read leaf: --out can overwrite host files
    ['file:download', 'destructive'],
    ['pipeline:health', 'read'],
    ['rep:scorecard', 'read'],
    ['metrics:velocity', 'read'],
    ['metrics:aging', 'read'],
    ['metrics:slippage', 'read'],
    ['metrics:coverage', 'read'],
    ['metrics:forecast', 'read'],
    ['metrics:conversion-matrix', 'read'], // not caught by the convert rule
    ['funnel', 'read'],
    ['digest', 'read'],
    ['audit', 'read'],
    ['lookup', 'read'],
    ['quota', 'read'],
    ['audit:stage-skips', 'read'],
    ['version', 'read'],
    ['some:future-verb', 'write'], // unknown verbs default to gated
  ])('classifies %s as %s', (id, kind) => {
    expect(classifyKind(id)).toBe(kind)
  })
})

describe('isExcluded', () => {
  it.each([
    'api', // arbitrary-request escape hatch
    'mcp:serve', // this server itself
    'auth:login',
    'auth:logout',
    'auth:status',
    'doctor',
    'watch', // long-running stream
    'changes', // advances a persistent watermark
    'sync:warehouse', // long-running file-writing export
    'backup', // long-running file-writing export
    // local operator state — an agent could booby-trap the operator's own CLI
    'alias:list',
    'alias:set',
    'alias:unset',
    'config:get',
    'config:list',
    'config:set',
    'config:unset',
    'profile:current',
    'profile:list',
    'profile:use',
  ])('excludes %s', (id) => {
    expect(isExcluded(id)).toBe(true)
  })

  it('keeps backup:diff (zero-API local read)', () => {
    expect(isExcluded('backup:diff')).toBe(false)
  })
})

describe('toolName', () => {
  it('replaces colons and dashes with underscores', () => {
    expect(toolName('deal:bulk-update')).toBe('deal_bulk_update')
    expect(toolName('metrics:conversion-matrix')).toBe(
      'metrics_conversion_matrix',
    )
    expect(toolName('search')).toBe('search')
  })
})

describe('buildCatalog', () => {
  const commands = [
    { id: 'deal:list', summary: 'List', flags: {}, args: {} },
    { id: 'deal:delete', description: 'Delete', flags: {}, args: {} },
    { id: 'api', summary: 'escape hatch', flags: {}, args: {} },
    { id: 'watch', summary: 'stream', flags: {}, args: {} },
    { id: 'doctor', summary: 'diagnostics', flags: {}, args: {} },
    { id: 'mcp:serve', summary: 'serve', flags: {}, args: {} },
    { id: 'auth:login', summary: 'login', flags: {}, args: {} },
    { id: 'secret', summary: 'hidden one', hidden: true, flags: {}, args: {} },
    { id: 'version' }, // bare: no summary/description/flags/args
  ]

  it('excludes hidden commands and the exclusion set', () => {
    const cat = buildCatalog(commands)
    expect(cat.map((t) => t.id)).toEqual([
      'deal:delete',
      'deal:list',
      'version',
    ])
  })

  it('maps id, toolName, summary and kind', () => {
    const cat = buildCatalog(commands)
    expect(cat.find((t) => t.id === 'deal:list')).toMatchObject({
      id: 'deal:list',
      toolName: 'deal_list',
      summary: 'List',
      kind: 'read',
    })
    // falls back to description when summary is absent
    expect(cat.find((t) => t.id === 'deal:delete').summary).toBe('Delete')
  })

  it('falls back to the id for summary and defaults flags/args when absent', () => {
    const v = buildCatalog(commands).find((t) => t.id === 'version')
    expect(v.summary).toBe('version')
    expect(v.flags).toEqual({})
    expect(v.args).toEqual({})
  })
})

// The security lock: walk the REAL oclif config and pin every command's
// classification. A new or reshuffled command MUST be audited here — a write
// presented as read-only is the failure mode this test exists to prevent.
describe('real-config classification audit', () => {
  /** Expected classification of every pdcli command (or 'excluded'). */
  const AUDITED = {
    'activity:create': 'write',
    'activity:delete': 'destructive',
    'activity:get': 'read',
    'activity:list': 'read',
    'activity:type:list': 'read',
    'activity:update': 'write',
    'alias:list': 'excluded',
    'alias:set': 'excluded',
    'alias:unset': 'excluded',
    api: 'excluded',
    audit: 'read',
    'audit:stage-skips': 'read',
    'auth:login': 'excluded',
    'auth:logout': 'excluded',
    'auth:status': 'excluded',
    backup: 'excluded',
    'backup:diff': 'read',
    changes: 'excluded',
    'config:get': 'excluded',
    'config:list': 'excluded',
    'config:set': 'excluded',
    'config:unset': 'excluded',
    'deal:bulk-update': 'destructive',
    'deal:context': 'read',
    'deal:convert': 'destructive',
    'deal:create': 'write',
    'deal:delete': 'destructive',
    'deal:follower:add': 'write',
    'deal:follower:list': 'read',
    'deal:follower:remove': 'destructive',
    'deal:get': 'read',
    'deal:history': 'read',
    'deal:list': 'read',
    'deal:participant:add': 'write',
    'deal:participant:list': 'read',
    'deal:participant:remove': 'destructive',
    'deal:product:add': 'write',
    'deal:product:list': 'read',
    'deal:product:remove': 'destructive',
    'deal:product:update': 'write',
    'deal:summary': 'read',
    'deal:update': 'write',
    'deal:upsert': 'write',
    digest: 'read',
    doctor: 'excluded',
    'field:create': 'write',
    'field:delete': 'destructive',
    'field:get': 'read',
    'field:list': 'read',
    'field:option:add': 'write',
    'field:option:remove': 'destructive',
    'field:update': 'write',
    'file:delete': 'destructive',
    'file:download': 'destructive',
    'file:get': 'read',
    'file:list': 'read',
    'file:remote-link': 'write',
    'file:update': 'write',
    'file:upload': 'write',
    'filter:delete': 'destructive',
    'filter:get': 'read',
    'filter:list': 'read',
    funnel: 'read',
    'goal:list': 'read',
    'lead:convert': 'destructive',
    'lead:create': 'write',
    'lead:delete': 'destructive',
    'lead:get': 'read',
    'lead:label:list': 'read',
    'lead:list': 'read',
    'lead:update': 'write',
    lookup: 'read',
    'mcp:serve': 'excluded',
    'metrics:aging': 'read',
    'metrics:conversion-matrix': 'read',
    'metrics:coverage': 'read',
    'metrics:forecast': 'read',
    'metrics:slippage': 'read',
    'metrics:velocity': 'read',
    'note:comment:add': 'write',
    'note:comment:delete': 'destructive',
    'note:comment:list': 'read',
    'note:comment:update': 'write',
    'note:create': 'write',
    'note:delete': 'destructive',
    'note:get': 'read',
    'note:list': 'read',
    'note:update': 'write',
    'org:create': 'write',
    'org:delete': 'destructive',
    'org:follower:add': 'write',
    'org:follower:list': 'read',
    'org:follower:remove': 'destructive',
    'org:get': 'read',
    'org:import': 'write',
    'org:list': 'read',
    'org:merge': 'destructive',
    'org:relationship:add': 'write',
    'org:relationship:list': 'read',
    'org:relationship:remove': 'destructive',
    'org:update': 'write',
    'org:upsert': 'write',
    'person:create': 'write',
    'person:delete': 'destructive',
    'person:follower:add': 'write',
    'person:follower:list': 'read',
    'person:follower:remove': 'destructive',
    'person:get': 'read',
    'person:import': 'write',
    'person:list': 'read',
    'person:merge': 'destructive',
    'person:update': 'write',
    'person:upsert': 'write',
    'pipeline:get': 'read',
    'pipeline:health': 'read',
    'pipeline:list': 'read',
    'product:create': 'write',
    'product:delete': 'destructive',
    'product:get': 'read',
    'product:list': 'read',
    'product:update': 'write',
    'profile:current': 'excluded',
    'profile:list': 'excluded',
    'profile:use': 'excluded',
    'project:create': 'write',
    'project:delete': 'destructive',
    'project:get': 'read',
    'project:list': 'read',
    'project:update': 'write',
    quota: 'read',
    'rep:scorecard': 'read',
    search: 'read',
    'stage:get': 'read',
    'stage:list': 'read',
    'sync:warehouse': 'excluded',
    'task:create': 'write',
    'task:delete': 'destructive',
    'task:get': 'read',
    'task:list': 'read',
    'task:update': 'write',
    'user:find': 'read',
    'user:list': 'read',
    'user:me': 'read',
    version: 'read',
    watch: 'excluded',
    'webhook:create': 'write',
    'webhook:delete': 'destructive',
    'webhook:list': 'read',
  }

  // Walk the actual command files (mirrors the oclif pattern strategy in
  // package.json) rather than a possibly stale generated oclif.manifest.json —
  // a brand-new command must fail this audit. Deliberately avoids Plugin.load,
  // which would import every command module and skew coverage merging.
  function realCommandIds() {
    const dir = fileURLToPath(new URL('../../../src/commands', import.meta.url))
    return (
      readdirSync(dir, { recursive: true })
        .filter((f) => f.endsWith('.js'))
        // readdirSync yields OS-native separators (backslashes on Windows);
        // split on both so command ids normalize to colon form everywhere.
        .map((f) => f.replace(/\.js$/, '').split(/[/\\]/).join(':'))
        .sort()
    )
  }

  it('classifies every real command exactly as audited', () => {
    const actual = Object.fromEntries(
      realCommandIds().map((id) => [
        id,
        isExcluded(id) ? 'excluded' : classifyKind(id),
      ]),
    )
    expect(actual).toEqual(AUDITED)
  })

  it('leaves no real command verb unclassified (no accidental defaults)', () => {
    for (const id of realCommandIds()) {
      if (isExcluded(id)) continue
      const leaf = id.split(':').pop()
      const known =
        KIND_OVERRIDES.has(id) ||
        READ_IDS.has(id) ||
        READ_LEAVES.has(leaf) ||
        WRITE_LEAVES.has(leaf) ||
        DESTRUCTIVE_LEAVES.has(leaf)
      expect(known, `${id} has an unaudited verb "${leaf}"`).toBe(true)
    }
  })

  it('every KIND_OVERRIDES id is a real, non-excluded command', () => {
    const ids = new Set(realCommandIds())
    for (const id of KIND_OVERRIDES.keys()) {
      expect(ids.has(id), `${id} is not a real command`).toBe(true)
      expect(isExcluded(id), `${id} is excluded`).toBe(false)
    }
  })

  it('every CURATED id is a real, non-excluded command', () => {
    const ids = new Set(realCommandIds())
    for (const id of CURATED) {
      expect(ids.has(id), `${id} is not a real command`).toBe(true)
      expect(isExcluded(id), `${id} is excluded`).toBe(false)
    }
  })

  it('locks the curated split: 46 reads + 14 writes, nothing destructive', () => {
    const kinds = [...CURATED].map(classifyKind)
    expect(kinds.filter((k) => k === 'read')).toHaveLength(46)
    expect(kinds.filter((k) => k === 'write')).toHaveLength(14)
    expect(kinds).not.toContain('destructive')
  })

  it('curates user:find so agents can resolve owner names to ids', () => {
    expect(CURATED.has('user:find')).toBe(true)
  })

  it('EXCLUDED never overlaps CURATED', () => {
    for (const id of EXCLUDED) expect(CURATED.has(id)).toBe(false)
  })
})
