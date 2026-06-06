import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: DealParticipantListCommand } =
  await import('../../../../src/commands/deal/participant/list.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('deal participant list', () => {
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

  it('lists participants across offset pages as JSON', async () => {
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          { id: 1, person_id: { value: 10, name: 'Alice' } },
          { id: 2, person_id: { value: 11, name: 'Bob' } },
        ],
        additional_data: {
          pagination: {
            start: 0,
            limit: 100,
            more_items_in_collection: true,
            next_start: 2,
          },
        },
      })
      .get('/api/v1/deals/42/participants')
      .query({ limit: '100', start: '2' })
      .reply(200, {
        success: true,
        data: [{ id: 3, person_id: { value: 12, name: 'Carol' } }],
        additional_data: {
          pagination: { more_items_in_collection: false },
        },
      })

    const stdout = await runCmd(DealParticipantListCommand, [
      '42',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(3)
    expect(rows[2].person_id.name).toBe('Carol')
  })

  it('caps results with --limit', async () => {
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query({ limit: '1' })
      .reply(200, {
        success: true,
        data: [{ id: 1, person_id: { value: 10, name: 'Alice' } }],
        additional_data: {
          pagination: { more_items_in_collection: true, next_start: 1 },
        },
      })

    const stdout = await runCmd(DealParticipantListCommand, [
      '42',
      '--limit',
      '1',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toHaveLength(1)
  })

  it('renders a table with participant id, person id and name', async () => {
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 7, person_id: { value: 10, name: 'Alice Smith' } }],
      })

    const stdout = await runCmd(DealParticipantListCommand, [
      '42',
      '--output',
      'table',
    ])

    expect(stdout).toContain('Alice Smith')
    expect(stdout).toContain('10')
    expect(stdout).toContain('7')
  })

  it('renders empty person cells when person_id is missing', async () => {
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 7 }],
      })

    const stdout = await runCmd(DealParticipantListCommand, [
      '42',
      '--output',
      'table',
    ])

    expect(stdout).toContain('7')
  })

  it('requires the deal id positional', async () => {
    await expect(DealParticipantListCommand.run([])).rejects.toThrow()
  })

  it('renders blanks when participant person data is missing', async () => {
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query(true)
      .reply(200, {
        success: true,
        data: [{ id: 7, person_id: null }],
        additional_data: { pagination: { more_items_in_collection: false } },
      })

    const stdout = await runCmd(DealParticipantListCommand, [
      '42',
      '--output',
      'table',
    ])
    expect(stdout).toContain('7')
  })
})
