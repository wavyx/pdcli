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

const { clearFieldsCache } = await import('../../../src/lib/fields.js')

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
    clearFieldsCache()
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

  it('--resolve-fields renders custom-field names and option labels', async () => {
    const HASH = 'd'.repeat(40)
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            id: 9,
            field_code: HASH,
            field_name: 'Tier',
            field_type: 'enum',
            options: [
              { id: 7, label: 'Gold' },
              { id: 8, label: 'Silver' },
            ],
            is_custom_field: true,
          },
        ],
        additional_data: { next_cursor: null },
      })
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            field_key: HASH,
            old_value: '8',
            new_value: '7',
            time: '2026-06-01 10:00:00',
            actor_user_id: 1,
          },
          {
            field_key: 'title',
            old_value: 'A',
            new_value: 'B',
            time: '2026-06-01 09:00:00',
            actor_user_id: 1,
          },
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealHistoryCommand, [
      '42',
      '--resolve-fields',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows[0].field_key).toBe('Tier')
    expect(rows[0].old_value).toBe('Silver')
    expect(rows[0].new_value).toBe('Gold')
    expect(rows[1].field_key).toBe('title') // non-custom keys pass through
  })

  it('passes non-option custom values through under --resolve-fields', async () => {
    const HASH = 'e'.repeat(40)
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            id: 10,
            field_code: HASH,
            field_name: 'Notes',
            field_type: 'varchar',
            is_custom_field: true,
          },
        ],
        additional_data: { next_cursor: null },
      })
    mockApi()
      .get('/api/v1/deals/42/changelog')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            field_key: HASH,
            old_value: 'draft',
            new_value: 'final',
            time: '2026-06-01 10:00:00',
            actor_user_id: 1,
          },
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealHistoryCommand, [
      '42',
      '--resolve-fields',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows[0].field_key).toBe('Notes')
    expect(rows[0].old_value).toBe('draft')
    expect(rows[0].new_value).toBe('final')
  })

  it('passes --limit to the API fetch when no field filter is set', async () => {
    const scope = mockApi()
      .get('/api/v1/deals/42/changelog')
      .query((q) => q.limit === '5')
      .reply(200, {
        success: true,
        data: [],
        additional_data: { next_cursor: null },
      })

    await runCmd(DealHistoryCommand, ['42', '--limit', '5', '--output', 'json'])
    expect(scope.isDone()).toBe(true)
  })
})
