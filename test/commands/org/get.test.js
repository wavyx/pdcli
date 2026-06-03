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

const { default: OrgGetCommand } =
  await import('../../../src/commands/org/get.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('org get', () => {
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

  it('prints the organization as raw JSON', async () => {
    mockApi()
      .get('/api/v2/organizations/7')
      .reply(200, {
        success: true,
        data: { id: 7, name: 'Acme Corp' },
      })

    const stdout = await runCmd(OrgGetCommand, ['7', '--output', 'json'])

    expect(JSON.parse(stdout).name).toBe('Acme Corp')
  })
})
