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

const { default: ActivityGetCommand } =
  await import('../../../src/commands/activity/get.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('activity get', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('prints the activity as raw JSON', async () => {
    mockApi()
      .get('/api/v2/activities/9')
      .reply(200, {
        success: true,
        data: { id: 9, subject: 'Demo call', type: 'call' },
      })

    const stdout = await runCmd(ActivityGetCommand, ['9', '--output', 'json'])

    expect(JSON.parse(stdout).subject).toBe('Demo call')
  })
})

describe('activity get table mode', () => {
  it('renders a field/value table without custom fields', async () => {
    mockApi()
      .get('/api/v2/activities/9')
      .reply(200, {
        success: true,
        data: { id: 9, subject: 'Demo call', custom_fields: {} },
      })

    const stdout = await runCmd(ActivityGetCommand, ['9', '--output', 'table'])

    expect(stdout).toContain('Demo call')
    expect(stdout).toContain('Field')
  })
})

describe('activity get with custom fields', () => {
  const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

  it('resolves activity custom fields in table mode', async () => {
    mockApi()
      .get('/api/v2/activities/9')
      .reply(200, {
        success: true,
        data: { id: 9, subject: 'Demo', custom_fields: { [HASH]: 10 } },
      })
    mockApi()
      .get('/api/v2/activityFields')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            field_code: HASH,
            field_name: 'Outcome',
            field_type: 'enum',
            options: [{ id: 10, label: 'Positive' }],
          },
        ],
      })

    const stdout = await runCmd(ActivityGetCommand, ['9', '--output', 'table'])

    expect(stdout).toContain('Outcome')
    expect(stdout).toContain('Positive')
  })
})
