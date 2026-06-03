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
      .query({ limit: '100' })
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
      .query({ limit: '100', owner_id: '3' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(OrgListCommand, [
      '--owner',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })
})
