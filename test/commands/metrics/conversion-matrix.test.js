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

const { default: ConversionMatrixCommand } =
  await import('../../../src/commands/metrics/conversion-matrix.js')
import { runCmd, mockApi } from '../../helpers.js'

const STAGES = [
  { id: 1, name: 'Qualified', pipeline_id: 1, order_nr: 0 },
  { id: 2, name: 'Demo', pipeline_id: 1, order_nr: 1 },
  { id: 3, name: 'Negotiation', pipeline_id: 1, order_nr: 2 },
]

const stageRow = (oldId, newId) => ({
  field_key: 'stage_id',
  old_value: String(oldId),
  new_value: String(newId),
})
const statusRow = (newStatus) => ({
  field_key: 'status',
  old_value: 'open',
  new_value: newStatus,
})

describe('metrics conversion-matrix', () => {
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

  function mockScope(deals, { pipelines = [{ id: 1, name: 'P' }] } = {}) {
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
        data: deals.filter((d) => d.status === 'open'),
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'won')
      .reply(200, {
        success: true,
        data: deals.filter((d) => d.status === 'won'),
      })
    mockApi()
      .get('/api/v2/deals')
      .query((q) => q.status === 'lost')
      .reply(200, {
        success: true,
        data: deals.filter((d) => d.status === 'lost'),
      })
  }

  it('mines transitions and emits the raw matrix object as JSON', async () => {
    mockScope([
      { id: 10, status: 'won', stage_id: 3 },
      { id: 11, status: 'open', stage_id: 2 },
    ])
    mockApi()
      .get('/api/v1/deals/10/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [stageRow(1, 2), stageRow(2, 3), statusRow('won')],
        additional_data: { next_cursor: null },
      })
    mockApi()
      .get('/api/v1/deals/11/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [stageRow(1, 2), stageRow(2, 1), stageRow(1, 2)],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ConversionMatrixCommand, ['--output', 'json'])
    const out = JSON.parse(stdout)

    // raw matrix object: matrix[from][to] = edge count
    expect(out.matrix['1']['2']).toBe(3) // deal10: 1, deal11: 2
    expect(out.matrix['2']['3']).toBe(1)
    expect(out.matrix['2']['1']).toBe(1) // backward
    expect(out.matrix['3']['won']).toBe(1)
    // the non-serializable cell() helper must NOT leak into JSON
    expect(out).not.toHaveProperty('cell')
    // backward edges surfaced
    expect(out.backwardEdges).toContainEqual(
      expect.objectContaining({ from: 2, to: 1, count: 1 }),
    )
  })

  it('renders a long-format edge table marking forward and backward moves', async () => {
    // 1->2->3 forward path plus a 3->2 backward slip, then won.
    mockScope([{ id: 30, status: 'won', stage_id: 3 }])
    mockApi()
      .get('/api/v1/deals/30/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          stageRow(1, 2),
          stageRow(2, 3),
          stageRow(3, 2),
          stageRow(2, 3),
          statusRow('won'),
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ConversionMatrixCommand, ['--output', 'table'])

    expect(stdout).toContain('Qualified')
    expect(stdout).toContain('Demo')
    expect(stdout).toContain('Won')
    // both directions render in the Direction column
    expect(stdout).toContain('forward')
    expect(stdout).toContain('backward')
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

    await expect(ConversionMatrixCommand.run([])).rejects.toThrow(/--pipeline/)
  })

  it('skips the pipelines lookup when --pipeline is given', async () => {
    nock.disableNetConnect()
    try {
      nock.enableNetConnect('acme.pipedrive.com')
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
      const stdout = await runCmd(ConversionMatrixCommand, [
        '--pipeline',
        '1',
        '--output',
        'json',
      ])
      const out = JSON.parse(stdout)
      expect(out.sources).toHaveLength(3)
      expect(out.edges).toEqual([])
    } finally {
      nock.enableNetConnect()
    }
  })

  it('tolerates a null pipelines payload', async () => {
    mockApi().get('/api/v2/pipelines').reply(200, { success: true, data: null })
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

    const stdout = await runCmd(ConversionMatrixCommand, ['--output', 'json'])
    expect(JSON.parse(stdout).sources).toHaveLength(3)
  })

  it('renders an empty-edge table without throwing', async () => {
    mockScope([{ id: 5, status: 'open', stage_id: 1 }])
    mockApi()
      .get('/api/v1/deals/5/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ConversionMatrixCommand, ['--output', 'table'])
    // empty matrix: still shows the per-source summary stages
    expect(stdout).toContain('Qualified')
  })
})
