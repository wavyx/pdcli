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

const { default: VelocityCommand } =
  await import('../../../src/commands/metrics/velocity.js')
import { runCmd, mockApi } from '../../helpers.js'

const DAY = 86_400_000

function daysAgo(n) {
  return new Date(Date.now() - n * DAY).toISOString()
}

describe('metrics velocity', () => {
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

  it('computes the velocity equation from open and closed deals', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, {
        success: true,
        data: [
          { id: 5, status: 'open', value: 500 },
          { id: 6, status: 'open', value: 800 },
          { id: 7, status: 'open', value: null },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query(
        (q) =>
          q.status === 'won' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(q.updated_since),
      )
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            status: 'won',
            value: 1000,
            won_time: daysAgo(5),
            add_time: daysAgo(15),
          },
          {
            id: 2,
            status: 'won',
            value: 3000,
            won_time: daysAgo(10),
            add_time: daysAgo(30),
          },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, {
        success: true,
        data: [{ id: 3, status: 'lost', lost_time: daysAgo(3) }],
      })

    const stdout = await runCmd(VelocityCommand, ['--output', 'json'])
    const v = JSON.parse(stdout)

    expect(v.openCount).toBe(3)
    expect(v.wonCount).toBe(2)
    expect(v.winRate).toBeCloseTo(2 / 3)
    expect(v.velocityPerDay).toBeCloseTo(266.67, 1)
  })

  it('renders a component table by default', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'won')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(VelocityCommand, ['--output', 'table'])

    expect(stdout).toContain('Win rate')
    expect(stdout).toContain('n/a')
  })
})

describe('metrics velocity table with data', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('renders all components with values', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, {
        success: true,
        data: [{ id: 5, status: 'open', value: 500 }],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'won')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            status: 'won',
            value: 1000,
            won_time: daysAgo(5),
            add_time: daysAgo(15),
          },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(VelocityCommand, ['--output', 'table'])

    expect(stdout).toContain('100.0% (1W/0L)')
    expect(stdout).toContain('Velocity / day')
  })
})
