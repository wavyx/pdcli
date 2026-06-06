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

const { default: PersonFollowerAddCommand } =
  await import('../../../../src/commands/person/follower/add.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('person follower add', () => {
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

  it('POSTs user_id and outputs the new follower', async () => {
    mockApi()
      .post('/api/v2/persons/42/followers', { user_id: 5 })
      .reply(201, {
        success: true,
        data: { user_id: 5, add_time: '2024-01-01T00:00:00Z' },
      })

    const stdout = await runCmd(PersonFollowerAddCommand, [
      '42',
      '--user',
      '5',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).user_id).toBe(5)
  })

  it('requires --user', async () => {
    await expect(PersonFollowerAddCommand.run(['42'])).rejects.toThrow()
  })

  it('requires the deal id positional', async () => {
    await expect(
      PersonFollowerAddCommand.run(['--user', '5']),
    ).rejects.toThrow()
  })
})
