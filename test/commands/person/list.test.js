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

const { default: PersonListCommand } =
  await import('../../../src/commands/person/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('person list', () => {
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

  it('lists persons with primary email/phone in table mode', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            name: 'Jane Doe',
            emails: [{ value: 'jane@acme.com', primary: true }],
            phones: [{ value: '+3225550100', primary: true }],
            org_id: 7,
          },
        ],
      })

    const stdout = await runCmd(PersonListCommand, ['--output', 'table'])

    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('jane@acme.com')
    expect(stdout).toContain('+3225550100')
  })

  it('passes org filter as org_id query param', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '500', org_id: '7' })
      .reply(200, { success: true, data: [{ id: 2, name: 'Org person' }] })

    const stdout = await runCmd(PersonListCommand, [
      '--org',
      '7',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].id).toBe(2)
  })

  it('defaults the per-request page size to 500', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '500' })
      .reply(200, { success: true, data: [{ id: 1, name: 'A' }] })

    const stdout = await runCmd(PersonListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].id).toBe(1)
  })

  it('maps power-params to their query params', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({
        limit: '500',
        filter_id: '5',
        ids: '1,2,3',
        sort_by: 'update_time',
        sort_direction: 'desc',
        updated_since: '2025-01-01T10:20:00Z',
        updated_until: '2025-02-01T10:20:00Z',
      })
      .reply(200, { success: true, data: [{ id: 1, name: 'A' }] })

    const stdout = await runCmd(PersonListCommand, [
      '--filter',
      '5',
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
      runCmd(PersonListCommand, ['--ids', ids, '--output', 'json']),
    ).rejects.toMatchObject({ oclif: { exit: 64 } })
  })
})

describe('person list edge cases', () => {
  it('renders blanks for persons without emails or phones', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 3, name: 'No Contact', emails: [], phones: null }],
      })

    const stdout = await runCmd(PersonListCommand, ['--output', 'table'])

    expect(stdout).toContain('No Contact')
  })

  it('falls back to the first email when none is primary', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 4,
            name: 'Secondary',
            emails: [{ value: 'first@acme.com', primary: false }],
          },
        ],
      })

    const stdout = await runCmd(PersonListCommand, ['--output', 'table'])

    expect(stdout).toContain('first@acme.com')
  })
})

describe('person list email entry without value', () => {
  it('renders an empty cell', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 5, name: 'Valueless', emails: [{ primary: true }] }],
      })

    const stdout = await runCmd(PersonListCommand, ['--output', 'table'])

    expect(stdout).toContain('Valueless')
  })
})
