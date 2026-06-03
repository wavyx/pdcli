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
