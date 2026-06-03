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

const { default: PersonGetCommand } =
  await import('../../../src/commands/person/get.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('person get', () => {
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

  it('prints the person as raw JSON', async () => {
    mockApi()
      .get('/api/v2/persons/5')
      .reply(200, {
        success: true,
        data: { id: 5, name: 'Jane Doe', emails: [] },
      })

    const stdout = await runCmd(PersonGetCommand, ['5', '--output', 'json'])

    expect(JSON.parse(stdout).name).toBe('Jane Doe')
  })

  it('renders a field/value table for a single person', async () => {
    mockApi()
      .get('/api/v2/persons/5')
      .reply(200, {
        success: true,
        data: { id: 5, name: 'Jane Doe' },
      })

    const stdout = await runCmd(PersonGetCommand, ['5', '--output', 'table'])

    expect(stdout).toContain('Field')
    expect(stdout).toContain('name')
    expect(stdout).toContain('Jane Doe')
  })
})

describe('person get with custom fields', () => {
  const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

  it('resolves person custom fields in table mode', async () => {
    mockApi()
      .get('/api/v2/persons/5')
      .reply(200, {
        success: true,
        data: { id: 5, name: 'Jane', custom_fields: { [HASH]: 10 } },
      })
    mockApi()
      .get('/api/v2/personFields')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            field_code: HASH,
            field_name: 'Segment',
            field_type: 'enum',
            options: [{ id: 10, label: 'Enterprise' }],
          },
        ],
      })

    const stdout = await runCmd(PersonGetCommand, ['5', '--output', 'table'])

    expect(stdout).toContain('Segment')
    expect(stdout).toContain('Enterprise')
  })
})
