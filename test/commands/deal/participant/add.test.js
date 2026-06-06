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

const { default: DealParticipantAddCommand } =
  await import('../../../../src/commands/deal/participant/add.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('deal participant add', () => {
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

  it('POSTs person_id and outputs the new participant', async () => {
    mockApi()
      .post('/api/v1/deals/42/participants', { person_id: 10 })
      .reply(200, {
        success: true,
        data: { id: 3, person_id: { value: 10, name: 'Alice' } },
      })

    const stdout = await runCmd(DealParticipantAddCommand, [
      '42',
      '--person',
      '10',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(3)
  })

  it('requires --person', async () => {
    await expect(DealParticipantAddCommand.run(['42'])).rejects.toThrow()
  })

  it('requires the deal id positional', async () => {
    await expect(
      DealParticipantAddCommand.run(['--person', '10']),
    ).rejects.toThrow()
  })
})
