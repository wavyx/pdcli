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

const { default: FunnelCommand } = await import('../../src/commands/funnel.js')
import { runCmd, mockApi } from '../helpers.js'

const STAGES = [
  { id: 1, name: 'Qualified', pipeline_id: 1, order_nr: 0 },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1 },
]

describe('funnel', () => {
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

  function mockCommon({ pipelines }) {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: pipelines })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, {
        success: true,
        data: [{ id: 5, status: 'open', stage_id: 1, value: 100 }],
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
            stage_id: 2,
            won_time: new Date().toISOString(),
          },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, {
        success: true,
        data: [
          {
            id: 2,
            status: 'lost',
            stage_id: 1,
            lost_time: new Date().toISOString(),
          },
        ],
      })
  }

  it('renders stage-reach conversion for a single-pipeline account', async () => {
    mockCommon({ pipelines: [{ id: 1, name: 'Pipeline' }] })

    const stdout = await runCmd(FunnelCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(2)
    expect(rows[0].reached).toBe(2)
    expect(rows[1].reached).toBe(1)
    expect(rows[1].conversionFromPrev).toBeCloseTo(0.5)
  })

  it('requires --pipeline when several pipelines exist', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, {
        success: true,
        data: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
      })

    await expect(FunnelCommand.run([])).rejects.toThrow(/--pipeline/)
  })
})

describe('funnel table output', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('renders percentage cells and blanks for the first stage', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'P' }] })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'won')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            status: 'won',
            stage_id: 2,
            won_time: new Date().toISOString(),
          },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(FunnelCommand, ['--output', 'table'])

    expect(stdout).toContain('100%')
    expect(stdout).toContain('Qualified')
  })
})

describe('funnel with explicit --pipeline and null pipeline data', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  function mockDealsAndStages() {
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: STAGES })
    for (const status of ['open', 'won', 'lost']) {
      mockApi()
        .get('/api/v2/deals')
        .query((q) => q.status === status)
        .reply(200, { success: true, data: [] })
    }
  }

  it('skips the pipelines lookup when --pipeline is given', async () => {
    nock.disableNetConnect()
    try {
      nock.enableNetConnect('acme.pipedrive.com')
      mockDealsAndStages()
      const stdout = await runCmd(FunnelCommand, [
        '--pipeline',
        '1',
        '--output',
        'json',
      ])
      expect(JSON.parse(stdout)).toHaveLength(2)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('tolerates a null pipelines payload', async () => {
    mockApi().get('/api/v2/pipelines').reply(200, { success: true, data: null })
    mockDealsAndStages()

    const stdout = await runCmd(FunnelCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toHaveLength(2)
  })
})
