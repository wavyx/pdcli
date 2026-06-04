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

const { default: HealthCommand } =
  await import('../../../src/commands/pipeline/health.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('pipeline health', () => {
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

  it('renders a per-stage health snapshot', async () => {
    mockApi()
      .get('/api/v2/pipelines')
      .reply(200, { success: true, data: [{ id: 1, name: 'Pipeline' }] })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            name: 'Qualified',
            pipeline_id: 1,
            order_nr: 0,
            deal_probability: 20,
          },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, {
        success: true,
        data: [
          {
            id: 5,
            status: 'open',
            stage_id: 1,
            value: 1000,
            probability: null,
            update_time: new Date().toISOString(),
            expected_close_date: null,
          },
        ],
      })
    mockApi()
      .get('/api/v2/activities')
      .query(true)
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(HealthCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)

    expect(rows[0]).toMatchObject({
      stage: 'Qualified',
      openCount: 1,
      openValue: 1000,
      weightedValue: 200,
      noNextActivityCount: 1,
    })
  })
})

describe('pipeline health guards and table', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
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

    await expect(HealthCommand.run([])).rejects.toThrow(/--pipeline/)
  })

  it('renders the table with rounded weighted values', async () => {
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            name: 'Qualified',
            pipeline_id: 1,
            order_nr: 0,
            deal_probability: 33,
          },
        ],
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'open')
      .reply(200, {
        success: true,
        data: [
          {
            id: 5,
            status: 'open',
            stage_id: 1,
            value: 1000,
            probability: null,
            update_time: new Date().toISOString(),
            expected_close_date: null,
          },
        ],
      })
    mockApi()
      .get('/api/v2/activities')
      .query(true)
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(HealthCommand, [
      '--pipeline',
      '1',
      '--output',
      'table',
    ])

    expect(stdout).toContain('330')
    expect(stdout).toContain('Qualified')
  })
})

describe('pipeline health null pipelines payload', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('tolerates a null pipelines payload', async () => {
    mockApi().get('/api/v2/pipelines').reply(200, { success: true, data: null })
    mockApi()
      .get('/api/v2/stages')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/activities')
      .query(true)
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(HealthCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual([])
  })
})
