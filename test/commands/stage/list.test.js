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

const { default: StageListCommand } =
  await import('../../../src/commands/stage/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('stage list', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('lists stages', async () => {
    mockApi()
      .get('/api/v2/stages')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 5,
            name: 'Qualified',
            pipeline_id: 1,
            deal_probability: 50,
            order_nr: 1,
          },
        ],
      })

    const stdout = await runCmd(StageListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].name).toBe('Qualified')
  })

  it('passes pipeline filter as pipeline_id query param', async () => {
    mockApi()
      .get('/api/v2/stages')
      .query({ limit: '100', pipeline_id: '1' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(StageListCommand, [
      '--pipeline',
      '1',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })
})
