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

const { default: OrgListCommand } =
  await import('../../../src/commands/org/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('org list', () => {
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

  it('lists organizations', async () => {
    mockApi()
      .get('/api/v2/organizations')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 7, name: 'Acme Corp', owner_id: 1 }],
      })

    const stdout = await runCmd(OrgListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].name).toBe('Acme Corp')
  })

  it('passes owner filter as owner_id query param', async () => {
    mockApi()
      .get('/api/v2/organizations')
      .query({ limit: '500', owner_id: '3' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(OrgListCommand, [
      '--owner',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('maps power-params to their query params', async () => {
    mockApi()
      .get('/api/v2/organizations')
      .query({
        limit: '500',
        ids: '1,2,3',
        sort_by: 'update_time',
        sort_direction: 'desc',
        updated_since: '2025-01-01T10:20:00Z',
        updated_until: '2025-02-01T10:20:00Z',
      })
      .reply(200, { success: true, data: [{ id: 1, name: 'A' }] })

    const stdout = await runCmd(OrgListCommand, [
      '--ids',
      '1,2,3',
      '--sort-by',
      'update_time',
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
      runCmd(OrgListCommand, ['--ids', ids, '--output', 'json']),
    ).rejects.toMatchObject({ oclif: { exit: 64 } })
  })

  it('refuses --ids together with --filter (the API silently drops ids)', async () => {
    const err = await OrgListCommand.run([
      '--ids',
      '1,2',
      '--filter',
      '5',
    ]).catch((e) => e)
    expect(String(err.message)).toMatch(/cannot also be provided/)
  })
})
