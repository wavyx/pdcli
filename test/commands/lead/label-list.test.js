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

const { default: LeadLabelListCommand } =
  await import('../../../src/commands/lead/label/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('lead label list', () => {
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

  it('lists lead labels as raw JSON with UUID ids', async () => {
    const scope = mockApi()
      .get('/api/v1/leadLabels')
      .reply(200, {
        success: true,
        data: [
          {
            id: 'f08b42a0-4e75-11ea-9643-03698ef1cfd6',
            name: 'Hot',
            color: 'red',
            add_time: '2020-02-13T10:00:00Z',
            update_time: '2020-02-13T10:00:00Z',
          },
          {
            id: 'a0b1c2d3-4e75-11ea-9643-03698ef1cfd6',
            name: 'Cold',
            color: 'blue',
          },
        ],
      })

    const stdout = await runCmd(LeadLabelListCommand, ['--output', 'json'])

    const rows = JSON.parse(stdout)
    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe('f08b42a0-4e75-11ea-9643-03698ef1cfd6')
    expect(rows[0].name).toBe('Hot')
    expect(rows[0].color).toBe('red')
    expect(scope.isDone()).toBe(true)
  })

  it('renders id, name, and color columns in table mode', async () => {
    mockApi()
      .get('/api/v1/leadLabels')
      .reply(200, {
        success: true,
        data: [
          {
            id: 'f08b42a0-4e75-11ea-9643-03698ef1cfd6',
            name: 'Hot',
            color: 'red',
          },
        ],
      })

    const stdout = await runCmd(LeadLabelListCommand, ['--output', 'table'])

    expect(stdout).toContain('f08b42a0-4e75-11ea-9643-03698ef1cfd6')
    expect(stdout).toContain('Hot')
    expect(stdout).toContain('red')
  })
})
