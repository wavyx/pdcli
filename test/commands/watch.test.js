import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

let watchState
vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
  getProfileConfig: vi.fn((_p, key) =>
    key === 'watch_state' ? watchState : undefined,
  ),
  setProfileConfig: vi.fn((_p, key, value) => {
    if (key === 'watch_state') watchState = value
  }),
}))

const { default: WatchCommand } = await import('../../src/commands/watch.js')
import { runCmd, mockApi } from '../helpers.js'

const DAY = 86_400_000
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString()

function mockBundle({
  open = [],
  won = [],
  lost = [],
  persons = [],
  organizations = [],
  activities = [],
} = {}) {
  mockApi()
    .get('/api/v2/deals')
    .query((q) => q.status === 'open')
    .reply(200, { success: true, data: open })
  mockApi()
    .get('/api/v2/deals')
    .query((q) => q.status === 'won')
    .reply(200, { success: true, data: won })
  mockApi()
    .get('/api/v2/deals')
    .query((q) => q.status === 'lost')
    .reply(200, { success: true, data: lost })
  mockApi()
    .get('/api/v2/persons')
    .query(() => true)
    .reply(200, { success: true, data: persons })
  mockApi()
    .get('/api/v2/organizations')
    .query(() => true)
    .reply(200, { success: true, data: organizations })
  mockApi()
    .get('/api/v2/activities')
    .query(() => true)
    .reply(200, { success: true, data: activities })
}

const STALE = {
  id: 1,
  title: 'Stale deal',
  status: 'open',
  update_time: daysAgo(30),
}
const STALE2 = {
  id: 2,
  title: 'Stale two',
  status: 'open',
  update_time: daysAgo(40),
}
const DUP_ORGS = [
  { id: 1, name: 'Acme' },
  { id: 2, name: 'Acme' },
]

describe('watch', () => {
  beforeEach(() => {
    nock.cleanAll()
    watchState = undefined
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })
  afterEach(() => nock.cleanAll())

  it('first run: emits new findings, seeds state, exits 8 on must severity', async () => {
    mockBundle({ open: [STALE, STALE2] }) // two findings → plural gate message
    const err = await runCmd(WatchCommand, [
      '--checks',
      'stale-deals',
      '--output',
      'json',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(8)
    const rows = JSON.parse(err.stdout)
    expect(rows.some((r) => r.check === 'stale-deals' && r.key === '1')).toBe(
      true,
    )
    expect(watchState['stale-deals'].sort()).toEqual(['1', '2'])
  })

  it('steady state: no new findings → exit 0, empty feed', async () => {
    watchState = { 'stale-deals': ['1'] }
    mockBundle({ open: [STALE] })
    const stdout = await runCmd(WatchCommand, [
      '--checks',
      'stale-deals',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual([])
  })

  it('--peek emits and gates but does NOT persist state', async () => {
    mockBundle({ open: [STALE] })
    const err = await runCmd(WatchCommand, [
      '--checks',
      'stale-deals',
      '--peek',
      '--output',
      'json',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(8)
    expect(watchState).toBeUndefined() // not advanced
  })

  it('does not arm the gate for should-severity findings by default', async () => {
    mockBundle({ organizations: DUP_ORGS })
    // duplicate-orgs is severity "should" → not armed under default (must)
    const stdout = await runCmd(WatchCommand, [
      '--checks',
      'duplicate-orgs',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows.some((r) => r.check === 'duplicate-orgs')).toBe(true) // still reported
    expect(watchState['duplicate-orgs']).toEqual(['acme']) // state advanced
  })

  it('arms the gate on should findings with --severity all', async () => {
    mockBundle({ organizations: DUP_ORGS })
    const err = await runCmd(WatchCommand, [
      '--checks',
      'duplicate-orgs',
      '--severity',
      'all',
      '--output',
      'json',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(8)
  })

  it('renders should-severity findings with a hollow marker in the table', async () => {
    mockBundle({ organizations: DUP_ORGS })
    // duplicate-orgs is "should" (not armed by default) → exit 0, '○' marker
    const stdout = await runCmd(WatchCommand, [
      '--checks',
      'duplicate-orgs',
      '--output',
      'table',
    ])
    expect(stdout).toContain('duplicate-orgs')
    expect(stdout).toContain('○')
  })

  it('errors with exit 64 on a single unknown check (singular message)', async () => {
    const err = await WatchCommand.run(['--checks', 'bogus']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Unknown check:/)
  })

  it('runs all checks when --checks is omitted (clean account → exit 0)', async () => {
    mockBundle() // empty account → no findings
    const stdout = await runCmd(WatchCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual([])
    expect(watchState).toBeDefined() // state seeded (all checks, empty)
  })

  it('errors with exit 64 on unknown checks (plural message)', async () => {
    const err = await WatchCommand.run(['--checks', 'bogus,alsobad']).catch(
      (e) => e,
    )
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Unknown checks:/)
  })

  it('renders a table of new findings', async () => {
    mockBundle({ open: [STALE] })
    const err = await runCmd(WatchCommand, [
      '--checks',
      'stale-deals',
      '--output',
      'table',
    ]).catch((e) => e)
    // exit 8 (must finding) but the report still printed to stdout
    expect(err.stdout).toContain('stale-deals')
    expect(err.stdout).toContain('Stale deal')
  })
})
