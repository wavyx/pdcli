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

const { default: DealHistoryCommand } =
  await import('../../../src/commands/deal/history.js')
import { runCmd, mockApi } from '../../helpers.js'

const ROWS = [
  {
    time: '2026-03-03T12:00:00Z',
    field_key: 'stage_id',
    old_value: '2',
    new_value: '3',
    actor_user_id: 99,
  },
  {
    time: '2026-03-02T09:00:00Z',
    field_key: 'title',
    old_value: 'Old title',
    new_value: 'New title',
    actor_user_id: 77,
  },
  {
    time: '2026-03-01T08:00:00Z',
    field_key: 'stage_id',
    old_value: '1',
    new_value: '2',
    actor_user_id: 99,
  },
]

describe('deal history', () => {
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

  it('lists field changes newest-first as raw rows in JSON', async () => {
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: ROWS,
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealHistoryCommand, ['42', '--output', 'json'])
    const rows = JSON.parse(stdout)

    // Native API order preserved (newest-first), raw rows untouched.
    expect(rows).toEqual(ROWS)
  })

  it('renders a table with the change columns', async () => {
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: ROWS,
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealHistoryCommand, ['42', '--output', 'table'])

    expect(stdout).toContain('stage_id')
    expect(stdout).toContain('New title')
    expect(stdout).toContain('99')
  })

  it('filters to a single field with --field', async () => {
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: ROWS,
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealHistoryCommand, [
      '42',
      '--field',
      'stage_id',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.field_key === 'stage_id')).toBe(true)
  })

  it('caps the number of rows with --limit', async () => {
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: ROWS,
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealHistoryCommand, [
      '42',
      '--limit',
      '1',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    // Newest row kept (native order), capped at the limit.
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(ROWS[0])
  })

  it('follows the changelog cursor across multiple pages', async () => {
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query((q) => q.cursor === undefined)
      .reply(200, {
        success: true,
        data: [ROWS[0]],
        additional_data: { next_cursor: 'p2' },
      })
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query((q) => q.cursor === 'p2')
      .reply(200, {
        success: true,
        data: [ROWS[1], ROWS[2]],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealHistoryCommand, ['42', '--output', 'json'])
    const rows = JSON.parse(stdout)

    expect(rows).toEqual(ROWS)
  })

  it('requires an integer id argument', async () => {
    await expect(DealHistoryCommand.run(['not-a-number'])).rejects.toThrow()
  })
})
