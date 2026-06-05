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

const { default: ActivityListCommand } =
  await import('../../../src/commands/activity/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('activity list', () => {
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

  it('lists activities', async () => {
    mockApi()
      .get('/api/v2/activities')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            subject: 'Call Jane',
            type: 'call',
            due_date: '2026-06-04',
            done: false,
            deal_id: 42,
          },
        ],
      })

    const stdout = await runCmd(ActivityListCommand, ['--output', 'table'])

    expect(stdout).toContain('Call Jane')
    expect(stdout).toContain('call')
    expect(stdout).toContain('2026-06-04')
  })

  it('passes done and deal filters as query params', async () => {
    mockApi()
      .get('/api/v2/activities')
      .query({ limit: '500', done: 'false', deal_id: '42' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(ActivityListCommand, [
      '--todo',
      '--deal',
      '42',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('maps power-params (incl. due_date sort) to their query params', async () => {
    mockApi()
      .get('/api/v2/activities')
      .query({
        limit: '500',
        ids: '1,2,3',
        sort_by: 'due_date',
        sort_direction: 'desc',
        updated_since: '2025-01-01T10:20:00Z',
        updated_until: '2025-02-01T10:20:00Z',
      })
      .reply(200, { success: true, data: [{ id: 1, subject: 'A' }] })

    const stdout = await runCmd(ActivityListCommand, [
      '--ids',
      '1,2,3',
      '--sort-by',
      'due_date',
      '--sort-direction',
      'desc',
      '--updated-since',
      '2025-01-01T10:20:00Z',
      '--updated-until',
      '2025-02-01T10:20:00Z',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].id).toBe(1)
  })

  it('rejects more than 100 ids with exit code 64', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1).join(',')
    await expect(
      runCmd(ActivityListCommand, ['--ids', ids, '--output', 'json']),
    ).rejects.toMatchObject({ oclif: { exit: 64 } })
  })
})

describe('activity list --done', () => {
  it('passes done=true as a query param', async () => {
    mockApi()
      .get('/api/v2/activities')
      .query({ limit: '500', done: 'true' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(ActivityListCommand, [
      '--done',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('filters by --type CLIENT-side (the v2 endpoint has no type param)', async () => {
    // The query must NOT contain type — the API 400s on unknown params.
    mockApi()
      .get('/api/v2/activities')
      .query((q) => !('type' in q))
      .reply(200, {
        success: true,
        data: [
          { id: 1, type: 'call', subject: 'A' },
          { id: 2, type: 'meeting', subject: 'B' },
          { id: 3, type: 'call', subject: 'C' },
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ActivityListCommand, [
      '--type',
      'call',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows.map((r) => r.id)).toEqual([1, 3])
  })

  it('refuses --ids together with --filter (the API silently drops ids)', async () => {
    const err = await ActivityListCommand.run([
      '--ids',
      '1,2',
      '--filter',
      '5',
    ]).catch((e) => e)
    expect(String(err.message)).toMatch(/cannot also be provided/)
  })
})
