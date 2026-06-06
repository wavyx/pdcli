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

const mockConfirmAction = vi.fn()
vi.mock('../../../../src/lib/confirm.js', () => ({
  confirmAction: mockConfirmAction,
}))

const { default: DealParticipantRemoveCommand } =
  await import('../../../../src/commands/deal/participant/remove.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('deal participant remove', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockConfirmAction.mockReset()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('removes after confirmation', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v1/deals/42/participants/3')
      .reply(200, { success: true, data: { id: 3 } })

    const stdout = await runCmd(DealParticipantRemoveCommand, [
      '42',
      '--participant',
      '3',
    ])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining('3'),
      false,
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Removed')
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v1/deals/42/participants/3')
      .reply(200, { success: true, data: { id: 3 } })

    await runCmd(DealParticipantRemoveCommand, [
      '42',
      '--participant',
      '3',
      '--yes',
    ])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(
        DealParticipantRemoveCommand.run(['42', '--participant', '3']),
      ).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('requires --participant', async () => {
    await expect(DealParticipantRemoveCommand.run(['42'])).rejects.toThrow()
  })

  it('requires the deal id positional', async () => {
    await expect(
      DealParticipantRemoveCommand.run(['--participant', '3']),
    ).rejects.toThrow()
  })
})
