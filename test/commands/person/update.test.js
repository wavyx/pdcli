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

const { default: PersonUpdateCommand } =
  await import('../../../src/commands/person/update.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('person update', () => {
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
      .patch('/api/v2/persons/42', { name: 'Renamed' })
      .reply(200, {
        success: true,
        data: { id: 42, name: 'Renamed' },
      })

    const stdout = await runCmd(PersonUpdateCommand, [
      '42',
      '--name',
      'Renamed',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).name).toBe('Renamed')
  })

  it('PATCHes emails and phones as primary-flagged arrays', async () => {
    mockApi()
      .patch('/api/v2/persons/42', {
        emails: [{ value: 'new@acme.com', primary: true }],
        phones: [{ value: '999', primary: true }],
      })
      .reply(200, {
        success: true,
        data: { id: 42 },
      })

    const stdout = await runCmd(PersonUpdateCommand, [
      '42',
      '--email',
      'new@acme.com',
      '--phone',
      '999',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(42)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(PersonUpdateCommand.run(['42'])).rejects.toThrow(
      /nothing to update/i,
    )
  })
})
