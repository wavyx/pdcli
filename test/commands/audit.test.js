import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: AuditCommand } = await import('../../src/commands/audit.js')
import { runCmd, mockApi } from '../helpers.js'

function mockAccount({ deals = [], persons = [], orgs = [], activities = [] }) {
  // v2 has no all_not_deleted — audit fetches the three statuses separately
  for (const status of ['open', 'won', 'lost']) {
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === status)
      .reply(200, {
        success: true,
        data: deals.filter((d) => d.status === status),
      })
  }
  mockApi()
    .get('/api/v2/persons')
    .query(true)
    .reply(200, { success: true, data: persons })
  mockApi()
    .get('/api/v2/organizations')
    .query(true)
    .reply(200, { success: true, data: orgs })
  mockApi()
    .get('/api/v2/activities')
    .query(true)
    .reply(200, { success: true, data: activities })
}

describe('audit', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('prints a summary of all checks', async () => {
    mockAccount({
      deals: [
        {
          id: 1,
          status: 'open',
          update_time: new Date(Date.now() - 30 * 86_400_000).toISOString(),
          add_time: new Date(Date.now() - 31 * 86_400_000).toISOString(),
          owner_id: 1,
          person_id: 1,
          value: 100,
          currency: 'EUR',
        },
      ],
    })

    const stdout = await runCmd(AuditCommand, ['--output', 'json'])
    const results = JSON.parse(stdout)

    expect(results.length).toBeGreaterThanOrEqual(11)
    const stale = results.find((r) => r.name === 'stale-deals')
    expect(stale.count).toBe(1)
  })

  it('--checks limits to the named checks', async () => {
    mockAccount({})

    const stdout = await runCmd(AuditCommand, [
      '--checks',
      'duplicate-persons,uncontactable-persons',
      '--output',
      'json',
    ])
    const results = JSON.parse(stdout)

    expect(results.map((r) => r.name).sort()).toEqual([
      'duplicate-persons',
      'uncontactable-persons',
    ])
  })

  it('rejects unknown check names (exit 64)', async () => {
    await expect(AuditCommand.run(['--checks', 'nope'])).rejects.toThrow(
      /unknown check/i,
    )
  })

  it('--strict exits 1 when a must-severity check has hits', async () => {
    mockAccount({
      persons: [{ id: 1, name: 'NoContact', emails: [], phones: [] }],
    })

    await expect(AuditCommand.run(['--strict'])).rejects.toThrow(
      /must-severity/i,
    )
  })

  it('--strict passes when only should-severity checks have hits', async () => {
    mockAccount({
      deals: [
        {
          id: 1,
          status: 'won',
          won_time: null,
          add_time: new Date().toISOString(),
        },
      ],
    })

    const stdout = await runCmd(AuditCommand, ['--strict', '--output', 'json'])
    expect(JSON.parse(stdout).length).toBeGreaterThan(0)
  })
})

describe('audit table and verbose output', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('renders the summary table with severity dots', async () => {
    mockAccount({
      persons: [{ id: 1, name: 'NoContact', emails: [], phones: [] }],
    })

    const stdout = await runCmd(AuditCommand, ['--output', 'table'])

    expect(stdout).toContain('Check')
    expect(stdout).toContain('●')
    expect(stdout).toContain('neither email nor phone')
  })

  it('--verbose lists findings and truncates beyond 25', async () => {
    const persons = Array.from({ length: 27 }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
      emails: [],
      phones: [],
    }))
    mockAccount({ persons })

    const stdout = await runCmd(AuditCommand, [
      '--output',
      'table',
      '--verbose',
    ])

    expect(stdout).toContain('"id":1') // listed item (JSON.stringify, no spaces)
    expect(stdout).toContain('… 2 more')
  })
})

describe('audit plural and verbose-small branches', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('pluralizes unknown checks', async () => {
    await expect(
      AuditCommand.run(['--checks', 'nope,alsobad']),
    ).rejects.toThrow(/Unknown checks/)
  })

  it('pluralizes multiple must-severity failures under --strict', async () => {
    mockAccount({
      persons: [
        { id: 1, name: 'A', emails: [{ value: 'd@a.com' }], phones: [] },
        { id: 2, name: 'B', emails: [{ value: 'd@a.com' }], phones: [] },
        { id: 3, name: 'NoContact', emails: [], phones: [] },
      ],
    })

    await expect(AuditCommand.run(['--strict'])).rejects.toThrow(
      /must-severity checks/,
    )
  })

  it('verbose lists small result sets without truncation', async () => {
    mockAccount({
      persons: [{ id: 1, name: 'NoContact', emails: [], phones: [] }],
    })

    const stdout = await runCmd(AuditCommand, [
      '--output',
      'table',
      '--verbose',
    ])

    expect(stdout).toContain('"id":1')
    expect(stdout).not.toContain('more')
  })
})
