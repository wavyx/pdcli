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

const { default: ActivityTypeListCommand } =
  await import('../../../../src/commands/activity/type/list.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('activity type list', () => {
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

  it('lists all activity types as JSON (unpaginated v1)', async () => {
    mockApi()
      .get('/api/v1/activityTypes')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            key_string: 'call',
            name: 'Call',
            active_flag: true,
          },
          {
            id: 2,
            key_string: 'meeting',
            name: 'Meeting',
            active_flag: false,
          },
        ],
      })

    const stdout = await runCmd(ActivityTypeListCommand, ['--output', 'json'])
    const types = JSON.parse(stdout)

    expect(types).toHaveLength(2)
    expect(types[0].key_string).toBe('call')
  })

  it('renders id, key_string, name and active (yes/no) columns in a table', async () => {
    mockApi()
      .get('/api/v1/activityTypes')
      .reply(200, {
        success: true,
        data: [
          { id: 1, key_string: 'call', name: 'Call', active_flag: true },
          {
            id: 2,
            key_string: 'meeting',
            name: 'Meeting',
            active_flag: false,
          },
        ],
      })

    const stdout = await runCmd(ActivityTypeListCommand, ['--output', 'table'])

    expect(stdout).toContain('call')
    expect(stdout).toContain('Call')
    expect(stdout).toContain('Active')
    expect(stdout).toContain('yes')
    expect(stdout).toContain('no')
  })

  it('applies --limit client-side', async () => {
    mockApi()
      .get('/api/v1/activityTypes')
      .reply(200, {
        success: true,
        data: [
          { id: 1, key_string: 'call', name: 'Call', active_flag: true },
          { id: 2, key_string: 'meeting', name: 'Meeting', active_flag: true },
          { id: 3, key_string: 'task', name: 'Task', active_flag: true },
        ],
      })

    const stdout = await runCmd(ActivityTypeListCommand, [
      '--limit',
      '2',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toHaveLength(2)
  })

  it('handles a response with no data field', async () => {
    mockApi().get('/api/v1/activityTypes').reply(200, { success: true })

    const stdout = await runCmd(ActivityTypeListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('renders an empty result cleanly', async () => {
    mockApi()
      .get('/api/v1/activityTypes')
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(ActivityTypeListCommand, ['--output', 'table'])

    expect(stdout).toContain('No results found.')
  })
})
