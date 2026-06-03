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

const { default: OrgUpdateCommand } =
  await import('../../../src/commands/org/update.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('org update', () => {
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

  it('PATCHes only the provided flags', async () => {
    mockApi()
      .patch('/api/v2/organizations/7', { name: 'Renamed' })
      .reply(200, {
        success: true,
        data: { id: 7, name: 'Renamed' },
      })

    const stdout = await runCmd(OrgUpdateCommand, [
      '7',
      '--name',
      'Renamed',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).name).toBe('Renamed')
  })

  it('PATCHes owner changes', async () => {
    mockApi()
      .patch('/api/v2/organizations/7', { owner_id: 9 })
      .reply(200, { success: true, data: { id: 7, owner_id: 9 } })

    const stdout = await runCmd(OrgUpdateCommand, [
      '7',
      '--owner',
      '9',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).owner_id).toBe(9)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(OrgUpdateCommand.run(['7'])).rejects.toThrow(
      /nothing to update/i,
    )
  })
})
