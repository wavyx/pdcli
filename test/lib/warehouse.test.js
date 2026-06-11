import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '../../src/lib/client.js'
import {
  runWarehouseSync,
  INCREMENTAL_ENTITIES,
} from '../../src/lib/warehouse.js'
import { formatApiDatetime } from '../../src/lib/period.js'

const API_BASE = 'https://acme.pipedrive.com'

function client() {
  return createClient({
    companyDomain: 'acme',
    token: 'tok',
    retry: false,
    timeout: 5000,
  })
}

/** nock all 5 incremental entities; `data[name]` supplies records, `cap` captures queries. */
function mockAll(data = {}, cap = {}) {
  for (const { name, path } of INCREMENTAL_ENTITIES) {
    nock(API_BASE)
      .get(path)
      .query((q) => {
        cap[name] = q
        return true
      })
      .reply(200, {
        success: true,
        data: data[name] ?? [],
        additional_data: { next_cursor: null },
      })
  }
}

function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, 'warehouse-manifest.json'), 'utf8'))
}
function readNdjson(dir, name) {
  const file = join(dir, `${name}.ndjson`)
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

let dir
beforeEach(() => {
  nock.cleanAll()
  dir = mkdtempSync(join(tmpdir(), 'pdcli-wh-'))
})
afterEach(() => nock.cleanAll())

describe('runWarehouseSync', () => {
  it('first run: full pull (no updated_since), writes NDJSON + per-entity watermark', async () => {
    const cap = {}
    mockAll(
      {
        deals: [
          { id: 1, update_time: '2026-06-05T00:00:00Z' },
          { id: 2, update_time: '2026-06-09T00:00:00Z' },
        ],
      },
      cap,
    )
    await runWarehouseSync(client(), dir, {})

    // first run sends NO updated_since (full seed), ascending sort
    expect(cap.deals.updated_since).toBeUndefined()
    expect(cap.deals.sort_by).toBe('update_time')
    expect(cap.deals.sort_direction).toBe('asc')

    const rows = readNdjson(dir, 'deals')
    expect(rows.map((r) => r.id)).toEqual([1, 2])

    const m = readManifest(dir)
    expect(m.watermarks.deals).toBe(
      formatApiDatetime(new Date('2026-06-09T00:00:00Z')),
    )
    // an empty entity advances no watermark and writes no file
    expect(readNdjson(dir, 'persons')).toBeNull()
    expect(m.watermarks.persons).toBeUndefined()
  })

  it('incremental run: queries updated_since from the stored per-entity watermark', async () => {
    writeFileSync(
      join(dir, 'warehouse-manifest.json'),
      JSON.stringify({
        watermarks: { deals: '2026-06-09T00:00:01Z' },
        counts: {},
      }),
    )
    const cap = {}
    mockAll({ deals: [{ id: 3, update_time: '2026-06-10T00:00:00Z' }] }, cap)
    await runWarehouseSync(client(), dir, {})

    expect(cap.deals.updated_since).toBe('2026-06-09T00:00:01Z')
    expect(readNdjson(dir, 'deals').map((r) => r.id)).toEqual([3])
    expect(readManifest(dir).watermarks.deals).toBe(
      formatApiDatetime(new Date('2026-06-10T00:00:00Z')),
    )
  })

  it('appends across runs (true CDC log)', async () => {
    writeFileSync(join(dir, 'deals.ndjson'), JSON.stringify({ id: 1 }) + '\n')
    writeFileSync(
      join(dir, 'warehouse-manifest.json'),
      JSON.stringify({
        watermarks: { deals: '2026-06-01T00:00:00Z' },
        counts: {},
      }),
    )
    mockAll({ deals: [{ id: 2, update_time: '2026-06-10T00:00:00Z' }] })
    await runWarehouseSync(client(), dir, {})
    expect(readNdjson(dir, 'deals').map((r) => r.id)).toEqual([1, 2]) // appended, not replaced
  })

  it('--full truncates the files and ignores stored watermarks', async () => {
    writeFileSync(join(dir, 'deals.ndjson'), JSON.stringify({ id: 99 }) + '\n')
    writeFileSync(
      join(dir, 'warehouse-manifest.json'),
      JSON.stringify({
        watermarks: { deals: '2026-06-09T00:00:00Z' },
        counts: {},
      }),
    )
    const cap = {}
    mockAll({ deals: [{ id: 1, update_time: '2026-06-10T00:00:00Z' }] }, cap)
    await runWarehouseSync(client(), dir, { full: true })

    expect(cap.deals.updated_since).toBeUndefined() // full → no watermark
    expect(readNdjson(dir, 'deals').map((r) => r.id)).toEqual([1]) // old id 99 gone
  })

  it('--since overrides the start for every entity', async () => {
    const cap = {}
    mockAll({}, cap)
    await runWarehouseSync(client(), dir, { since: '2026-01-01T00:00:00Z' })
    for (const { name } of INCREMENTAL_ENTITIES) {
      expect(cap[name].updated_since).toBe('2026-01-01T00:00:00Z')
    }
  })

  it('reports progress per entity', async () => {
    const seen = []
    mockAll({ deals: [{ id: 1, update_time: '2026-06-10T00:00:00Z' }] })
    await runWarehouseSync(client(), dir, {
      onProgress: (entity, count) => seen.push([entity, count]),
    })
    expect(seen).toContainEqual(['deals', 1])
    expect(seen.find(([e]) => e === 'persons')).toEqual(['persons', 0])
  })

  it('treats a corrupt manifest as a fresh run', async () => {
    writeFileSync(join(dir, 'warehouse-manifest.json'), '{not json')
    const cap = {}
    mockAll({ deals: [{ id: 1, update_time: '2026-06-10T00:00:00Z' }] }, cap)
    await runWarehouseSync(client(), dir, {})
    expect(cap.deals.updated_since).toBeUndefined() // no watermark → full
    expect(readNdjson(dir, 'deals').map((r) => r.id)).toEqual([1])
  })

  it('tolerates a manifest missing watermarks/counts keys', async () => {
    writeFileSync(join(dir, 'warehouse-manifest.json'), '{}')
    const cap = {}
    mockAll({ deals: [{ id: 1, update_time: '2026-06-10T00:00:00Z' }] }, cap)
    await runWarehouseSync(client(), dir, {})
    expect(cap.deals.updated_since).toBeUndefined()
    expect(readManifest(dir).watermarks.deals).toBeDefined()
  })

  it('keeps the max watermark when a later record shares/precedes the timestamp', async () => {
    mockAll({
      deals: [
        { id: 1, update_time: '2026-06-09T00:00:00Z' },
        { id: 2, update_time: '2026-06-09T00:00:00Z' }, // equal → max unchanged
      ],
    })
    await runWarehouseSync(client(), dir, {})
    expect(readManifest(dir).watermarks.deals).toBe(
      formatApiDatetime(new Date('2026-06-09T00:00:00Z')),
    )
  })

  it('does not advance a watermark for an entity whose records lack update_time', async () => {
    mockAll({ deals: [{ id: 1, update_time: null }] })
    await runWarehouseSync(client(), dir, {})
    expect(readNdjson(dir, 'deals').map((r) => r.id)).toEqual([1]) // still exported
    expect(readManifest(dir).watermarks.deals).toBeUndefined() // no advance
  })

  it('does not crash on a malformed update_time (treated like missing)', async () => {
    mockAll({ deals: [{ id: 1, update_time: 'not-a-date' }] })
    await runWarehouseSync(client(), dir, {}) // must not throw
    expect(readNdjson(dir, 'deals').map((r) => r.id)).toEqual([1]) // exported
    expect(readManifest(dir).watermarks.deals).toBeUndefined() // no advance
  })

  it('queries each entity with its OWN stored watermark (independent)', async () => {
    writeFileSync(
      join(dir, 'warehouse-manifest.json'),
      JSON.stringify({
        watermarks: {
          deals: '2026-06-01T00:00:00Z',
          persons: '2026-05-01T00:00:00Z',
        },
        counts: {},
      }),
    )
    const cap = {}
    mockAll({}, cap)
    await runWarehouseSync(client(), dir, {})
    expect(cap.deals.updated_since).toBe('2026-06-01T00:00:00Z')
    expect(cap.persons.updated_since).toBe('2026-05-01T00:00:00Z')
  })

  it('a one-off --since does not rewind a higher stored watermark', async () => {
    writeFileSync(
      join(dir, 'warehouse-manifest.json'),
      JSON.stringify({
        watermarks: { deals: '2026-06-10T00:00:00Z' },
        counts: {},
      }),
    )
    // backfill window's newest record (06-08) is OLDER than the stored cursor
    mockAll({ deals: [{ id: 1, update_time: '2026-06-08T00:00:00Z' }] })
    await runWarehouseSync(client(), dir, { since: '2026-06-01T00:00:00Z' })
    expect(readManifest(dir).watermarks.deals).toBe('2026-06-10T00:00:00Z') // unchanged
  })

  it('an interrupted --full clears the on-disk watermark before truncating', async () => {
    writeFileSync(
      join(dir, 'warehouse-manifest.json'),
      JSON.stringify({
        watermarks: { deals: '2026-06-09T00:00:00Z' },
        counts: {},
      }),
    )
    nock(API_BASE)
      .get('/api/v2/deals')
      .query(() => true)
      .reply(500, { success: false })
    await expect(
      runWarehouseSync(client(), dir, { full: true }),
    ).rejects.toBeTruthy()
    // watermark was persisted-cleared up-front → next run full-re-pulls deals
    expect(readManifest(dir).watermarks.deals).toBeUndefined()
  })
})
