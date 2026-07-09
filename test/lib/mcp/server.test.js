import { describe, it, expect } from 'vitest'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  buildServer,
  selectTools,
  annotationsFor,
} from '../../../src/lib/mcp/server.js'
import { buildCatalog } from '../../../src/lib/mcp/catalog.js'

// Mix of curated and non-curated real ids across topics.
const commands = [
  {
    id: 'deal:list',
    summary: 'List deals',
    flags: {
      status: { type: 'option', options: ['open', 'won'], description: 's' },
    },
    args: {},
  },
  { id: 'deal:create', summary: 'Create deal', flags: {}, args: {} },
  {
    id: 'deal:delete',
    summary: 'Delete deal',
    flags: { yes: { type: 'boolean' } },
    args: { id: { required: true } },
  },
  { id: 'webhook:list', summary: 'List webhooks', flags: {}, args: {} },
  { id: 'webhook:create', summary: 'Create webhook', flags: {}, args: {} },
  { id: 'search', summary: 'Search', flags: {}, args: {} },
]
const catalog = buildCatalog(commands)

const ids = (tools) => tools.map((t) => t.id).sort()

describe('selectTools selection matrix', () => {
  it('defaults to curated read-only tools', () => {
    expect(ids(selectTools(catalog, {}))).toEqual(['deal:list', 'search'])
  })

  it('adds curated writes with allowWrites (never non-curated ones)', () => {
    expect(ids(selectTools(catalog, { allowWrites: true }))).toEqual([
      'deal:create',
      'deal:list',
      'search',
    ])
  })

  it('exposes every non-excluded read with allTools', () => {
    expect(ids(selectTools(catalog, { allTools: true }))).toEqual([
      'deal:list',
      'search',
      'webhook:list',
    ])
  })

  it('exposes everything with allTools + allowWrites', () => {
    expect(
      ids(selectTools(catalog, { allTools: true, allowWrites: true })),
    ).toEqual([
      'deal:create',
      'deal:delete',
      'deal:list',
      'search',
      'webhook:create',
      'webhook:list',
    ])
  })

  it('scopes to the given topics (reads only by default)', () => {
    expect(ids(selectTools(catalog, { topics: ['deal'] }))).toEqual([
      'deal:list',
    ])
    expect(
      ids(selectTools(catalog, { topics: ['webhook', 'search'] })),
    ).toEqual(['search', 'webhook:list'])
  })

  it('topics + allowWrites exposes the topic writes and destructives', () => {
    expect(
      ids(selectTools(catalog, { topics: ['deal'], allowWrites: true })),
    ).toEqual(['deal:create', 'deal:delete', 'deal:list'])
  })

  it('topics wins over allTools', () => {
    expect(
      ids(selectTools(catalog, { topics: ['webhook'], allTools: true })),
    ).toEqual(['webhook:list'])
  })

  it('defaults its options object entirely', () => {
    expect(ids(selectTools(catalog))).toEqual(['deal:list', 'search'])
  })

  it('never exposes file:download without allowWrites (host-file overwrite)', () => {
    const fileCatalog = buildCatalog([
      { id: 'file:list', summary: 'List files' },
      { id: 'file:download', summary: 'Download a file' },
    ])
    expect(ids(selectTools(fileCatalog, { topics: ['file'] }))).toEqual([
      'file:list',
    ])
    expect(ids(selectTools(fileCatalog, { allTools: true }))).toEqual([
      'file:list',
    ])
    expect(
      ids(selectTools(fileCatalog, { topics: ['file'], allowWrites: true })),
    ).toEqual(['file:download', 'file:list'])
  })
})

describe('annotationsFor', () => {
  it('flags reads read-only and idempotent', () => {
    expect(annotationsFor({ kind: 'read', summary: 'x' })).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    })
  })
  it('flags destructive tools destructive', () => {
    expect(annotationsFor({ kind: 'destructive', summary: 'x' })).toMatchObject(
      {
        readOnlyHint: false,
        destructiveHint: true,
      },
    )
  })
  it('flags writes destructive too — update/upsert overwrite existing values', () => {
    // MCP spec: destructiveHint:false promises additive-only. An update tool
    // replaces field values, so any non-read tool must carry the hint.
    expect(annotationsFor({ kind: 'write', summary: 'x' })).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    })
  })
})

async function connect(options) {
  const { server } = buildServer({
    commands,
    version: '0.18.0',
    exec: async () => ({ stdout: '[]', stderr: '', code: 0 }),
    ...options,
  })
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  await server.connect(serverT)
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(clientT)
  return client
}

describe('buildServer', () => {
  it('exposes only curated read tools by default', async () => {
    const client = await connect({ allowWrites: false })
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['deal_list', 'search'])
    await client.close()
  })

  it('exposes destructive tools (with hints) under allTools + allowWrites', async () => {
    const client = await connect({ allTools: true, allowWrites: true })
    const { tools } = await client.listTools()
    const del = tools.find((t) => t.name === 'deal_delete')
    expect(del.annotations.destructiveHint).toBe(true)
    expect(del.inputSchema.properties.id).toBeDefined()
    await client.close()
  })

  it('routes a tool call through exec into structuredContent', async () => {
    let seenArgv
    const exec = async (argv) => {
      seenArgv = argv
      return { stdout: '[{"id":1}]', stderr: '', code: 0 }
    }
    const client = await connect({ exec })
    const res = await client.callTool({
      name: 'deal_list',
      arguments: { status: 'open' },
    })
    expect(res.structuredContent).toEqual({ results: [{ id: 1 }] })
    expect(seenArgv).toContain('--status=open')
    await client.close()
  })
})
