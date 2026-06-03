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

const { default: DealUpdateCommand } =
  await import('../../../src/commands/deal/update.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('deal update', () => {
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
      .patch('/api/v2/deals/42', { stage_id: 5 })
      .reply(200, {
        success: true,
        data: { id: 42, title: 'Deal', stage_id: 5 },
      })

    const stdout = await runCmd(DealUpdateCommand, [
      '42',
      '--stage',
      '5',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).stage_id).toBe(5)
  })

  it('PATCHes status changes (won/lost)', async () => {
    mockApi()
      .patch('/api/v2/deals/42', { status: 'won' })
      .reply(200, { success: true, data: { id: 42, status: 'won' } })

    const stdout = await runCmd(DealUpdateCommand, [
      '42',
      '--status',
      'won',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).status).toBe('won')
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(DealUpdateCommand.run(['42'])).rejects.toThrow(
      /nothing to update/i,
    )
  })
})
