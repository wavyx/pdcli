import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

let watermark
vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
  getProfileConfig: vi.fn((_p, key) =>
    key === 'changes_watermark' ? watermark : undefined,
  ),
  setProfileConfig: vi.fn((_p, key, value) => {
    if (key === 'changes_watermark') watermark = value
  }),
}))

const { default: ChangesCommand } =
  await import('../../src/commands/changes.js')
import { runCmd, mockApi } from '../helpers.js'
import { formatApiDatetime } from '../../src/lib/period.js'

const DAY = 86_400_000
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString()

const DEALS = [
  {
    id: 1,
    title: 'New deal',
    add_time: daysAgo(2),
    update_time: daysAgo(1),
  },
  {
    id: 2,
    title: 'Old deal touched',
    add_time: daysAgo(100),
    update_time: daysAgo(3),
  },
]
const PERSONS = [
  { id: 7, name: 'Jane', add_time: daysAgo(5), update_time: daysAgo(4) },
]

const ENTITIES = {
  deals: DEALS,
  persons: PERSONS,
  organizations: [],
  activities: [],
  products: [],
}

function mockEntities(data = ENTITIES) {
  for (const [name, items] of Object.entries(data)) {
    mockApi()
      .get(`/api/v2/${name}`)
      .query(
        (q) =>
          q.updated_since != null &&
          q.sort_by === 'update_time' &&
          q.sort_direction === 'asc',
      )
      .reply(200, { success: true, data: items })
  }
}

describe('changes', () => {
  beforeEach(() => {
    nock.cleanAll()
    watermark = undefined
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })
  afterEach(() => nock.cleanAll())

  it('emits a unified created/updated feed across entities (JSON)', async () => {
    mockEntities()
    const stdout = await runCmd(ChangesCommand, [
      '--since',
      '30d',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows).toHaveLength(3)
    const byId = new Map(rows.map((r) => [`${r.entity}:${r.id}`, r]))
    expect(byId.get('deals:1').change).toBe('created')
    expect(byId.get('deals:2').change).toBe('updated')
    expect(byId.get('persons:7')).toMatchObject({
      change: 'created',
      title: 'Jane',
    })
  })

  it('advances the stored watermark to the newest update_time and notes it on stderr', async () => {
    mockEntities()
    const writes = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      writes.push(String(c))
      return true
    })
    try {
      await runCmd(ChangesCommand, ['--since', '30d', '--output', 'json'])
    } finally {
      spy.mockRestore()
    }
    expect(watermark).toBe(formatApiDatetime(new Date(DEALS[0].update_time)))
    expect(writes.join('')).toMatch(/watermark/i)
  })

  it('does not advance the watermark with --peek', async () => {
    watermark = '2026-01-01T00:00:00Z'
    mockEntities()
    await runCmd(ChangesCommand, ['--peek', '--output', 'json'])
    expect(watermark).toBe('2026-01-01T00:00:00Z')
  })

  it('uses the stored watermark when --since is omitted', async () => {
    watermark = daysAgo(10)
    let sentSince
    mockApi()
      .get('/api/v2/deals')
      .query((q) => {
        sentSince = q.updated_since
        return q.sort_by === 'update_time'
      })
      .reply(200, { success: true, data: [] })
    for (const name of ['persons', 'organizations', 'activities', 'products']) {
      mockApi()
        .get(`/api/v2/${name}`)
        .query(() => true)
        .reply(200, { success: true, data: [] })
    }
    await runCmd(ChangesCommand, ['--output', 'json'])
    expect(sentSince).toBe(formatApiDatetime(new Date(watermark)))
  })

  it('errors with exit 64 when no --since and no stored watermark', async () => {
    const err = await ChangesCommand.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--since/)
  })

  it('errors with exit 64 on an unparseable --since timestamp', async () => {
    const err = await ChangesCommand.run(['--since', 'someday']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('accepts an absolute RFC3339 --since timestamp', async () => {
    let sentSince
    mockApi()
      .get('/api/v2/deals')
      .query((q) => {
        sentSince = q.updated_since
        return true
      })
      .reply(200, { success: true, data: [] })
    for (const name of ['persons', 'organizations', 'activities', 'products']) {
      mockApi()
        .get(`/api/v2/${name}`)
        .query(() => true)
        .reply(200, { success: true, data: [] })
    }
    await runCmd(ChangesCommand, [
      '--since',
      '2026-05-01T00:00:00Z',
      '--output',
      'json',
    ])
    expect(sentSince).toBe('2026-05-01T00:00:00Z')
  })

  it('leaves the watermark untouched when there are no changes', async () => {
    watermark = '2026-01-01T00:00:00Z'
    mockEntities({
      deals: [],
      persons: [],
      organizations: [],
      activities: [],
      products: [],
    })
    const stdout = await runCmd(ChangesCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual([])
    expect(watermark).toBe('2026-01-01T00:00:00Z')
  })

  it('renders a table with entity and change columns', async () => {
    mockEntities()
    const stdout = await runCmd(ChangesCommand, [
      '--since',
      '30d',
      '--output',
      'table',
    ])
    expect(stdout.toLowerCase()).toContain('entity')
    expect(stdout).toContain('New deal')
    expect(stdout).toContain('created')
  })

  it('renders rows missing a title or update_time in the table', async () => {
    mockEntities({
      deals: [{ id: 9, title: null, add_time: null, update_time: null }],
      persons: [],
      organizations: [],
      activities: [],
      products: [],
    })
    const stdout = await runCmd(ChangesCommand, [
      '--since',
      '30d',
      '--output',
      'table',
    ])
    expect(stdout).toContain('deals')
    expect(stdout).toContain('updated')
  })
})
