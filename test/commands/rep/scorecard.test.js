import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: ScorecardCommand } =
  await import('../../../src/commands/rep/scorecard.js')
import { runCmd, mockApi } from '../../helpers.js'

const DAY = 86_400_000
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString()
const dateAhead = (n) =>
  new Date(Date.now() + n * DAY).toISOString().slice(0, 10)

const USERS = {
  success: true,
  data: [
    { id: 1, name: 'Alice', email: 'a@x.com', active_flag: true },
    { id: 2, name: 'Bob', email: 'b@x.com', active_flag: false },
  ],
}

const OPEN = [
  {
    id: 1,
    owner_id: 1,
    status: 'open',
    value: 50000,
    update_time: daysAgo(2),
    expected_close_date: dateAhead(20),
    person_id: 10,
  },
  {
    id: 2,
    owner_id: 2,
    status: 'open',
    value: 20000,
    update_time: daysAgo(30), // stale
    expected_close_date: null, // no close date
    person_id: null,
    org_id: null, // missing contact
  },
]
const WON = [
  {
    id: 3,
    owner_id: 1,
    status: 'won',
    value: 40000,
    won_time: daysAgo(20),
    add_time: daysAgo(50), // cycle 30d
  },
]
const LOST = [
  { id: 4, owner_id: 1, status: 'lost', value: 0, lost_time: daysAgo(15) },
]

function mockFetch({
  open = OPEN,
  won = WON,
  lost = LOST,
  ownerId,
  users = USERS,
} = {}) {
  const matchOwner = (q) => ownerId == null || q.owner_id === String(ownerId)
  mockApi()
    .get('/api/v2/deals')
    .query((q) => q.status === 'open' && matchOwner(q))
    .reply(200, { success: true, data: open })
  mockApi()
    .get('/api/v2/deals')
    .query(
      (q) => q.status === 'won' && q.updated_since != null && matchOwner(q),
    )
    .reply(200, { success: true, data: won })
  mockApi()
    .get('/api/v2/deals')
    .query(
      (q) => q.status === 'lost' && q.updated_since != null && matchOwner(q),
    )
    .reply(200, { success: true, data: lost })
  mockApi().get('/api/v1/users').reply(200, users)
}

describe('rep scorecard', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })
  afterEach(() => nock.cleanAll())

  it('produces a per-rep row with velocity, hygiene, and resolved names (JSON)', async () => {
    mockFetch()
    const stdout = await runCmd(ScorecardCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)
    const byId = new Map(rows.map((r) => [r.ownerId, r]))

    const alice = byId.get(1)
    expect(alice.ownerName).toBe('Alice')
    expect(alice.active).toBe(true)
    expect(alice.openCount).toBe(1)
    expect(alice.winRate).toBe(0.5)
    expect(alice.avgCycleDays).toBeCloseTo(30, 0)

    const bob = byId.get(2)
    expect(bob.ownerName).toBe('Bob')
    expect(bob.active).toBe(false)
    expect(bob.winRate).toBeNull()
    expect(bob.staleOpen).toBe(1)
    expect(bob.noCloseDate).toBe(1)
    expect(bob.missingContact).toBe(1)
  })

  it('renders a table with rep, win rate, and hygiene columns', async () => {
    mockFetch()
    const stdout = await runCmd(ScorecardCommand, ['--output', 'table'])
    expect(stdout).toContain('Alice')
    expect(stdout).toContain('Bob')
    expect(stdout).toContain('Rep')
    expect(stdout.toLowerCase()).toContain('win rate')
    expect(stdout.toLowerCase()).toContain('stale')
  })

  it('restricts the deal queries to a single owner with --owner', async () => {
    mockFetch({ open: [OPEN[0]], ownerId: 1 })
    const stdout = await runCmd(ScorecardCommand, [
      '--owner',
      '1',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0].ownerId).toBe(1)
  })

  it('shows no results when there are no deals', async () => {
    mockFetch({ open: [], won: [], lost: [] })
    const stdout = await runCmd(ScorecardCommand, ['--output', 'table'])
    expect(stdout.toLowerCase()).toContain('no results')
  })

  it('renders a dash for the active column of an unassigned owner', async () => {
    mockFetch({
      open: [
        {
          id: 9,
          owner_id: null,
          status: 'open',
          value: 1000,
          update_time: daysAgo(1),
          expected_close_date: dateAhead(10),
          person_id: 7,
        },
      ],
      won: [],
      lost: [],
    })
    const stdout = await runCmd(ScorecardCommand, ['--output', 'table'])
    expect(stdout).toContain('Unassigned')
    expect(stdout).toContain('—')
  })

  it('renders n/a (not NaN) for cycle when a won deal lacks add_time', async () => {
    mockFetch({
      open: [],
      // won in window but no add_time → cycle is NaN
      won: [
        {
          id: 9,
          owner_id: 1,
          status: 'won',
          value: 1000,
          won_time: daysAgo(5),
        },
      ],
      lost: [],
    })
    const stdout = await runCmd(ScorecardCommand, ['--output', 'table'])
    expect(stdout).toContain('Alice')
    expect(stdout).not.toContain('NaN')
  })

  it('tolerates a users response with no data array', async () => {
    mockFetch({ users: { success: true } })
    const stdout = await runCmd(ScorecardCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)
    // No roster → owners fall back to "#id" names.
    expect(rows.find((r) => r.ownerId === 1).ownerName).toBe('#1')
  })
})
