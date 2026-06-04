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

const { default: LeadUpdateCommand } =
  await import('../../../src/commands/lead/update.js')
import { runCmd, mockApi } from '../../helpers.js'

const ID = 'adf21080-0e10-11eb-879b-05d71fb426ec'

describe('lead update', () => {
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

  it('PATCHes only the provided flags', async () => {
    mockApi()
      .patch(`/api/v1/leads/${ID}`, { title: 'Renamed' })
      .reply(200, {
        success: true,
        data: { id: ID, title: 'Renamed' },
      })

    const stdout = await runCmd(LeadUpdateCommand, [
      ID,
      '--title',
      'Renamed',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).title).toBe('Renamed')
  })

  it('PATCHes a value object', async () => {
    mockApi()
      .patch(`/api/v1/leads/${ID}`, {
        value: { amount: 7500, currency: 'USD' },
      })
      .reply(200, {
        success: true,
        data: { id: ID, value: { amount: 7500, currency: 'USD' } },
      })

    const stdout = await runCmd(LeadUpdateCommand, [
      ID,
      '--value',
      '7500',
      '--currency',
      'USD',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).value.amount).toBe(7500)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(LeadUpdateCommand.run([ID])).rejects.toThrow(
      /nothing to update/i,
    )
  })
})
