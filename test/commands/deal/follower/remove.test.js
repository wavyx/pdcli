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

const { default: DealFollowerRemoveCommand } =
  await import('../../../../src/commands/deal/follower/remove.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('deal follower remove', () => {
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
      .delete('/api/v2/deals/42/followers/5')
      .reply(200, { success: true, data: { user_id: 5 } })

    const stdout = await runCmd(DealFollowerRemoveCommand, [
      '42',
      '--user',
      '5',
    ])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining('5'),
      false,
      { default: false },
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Removed')
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v2/deals/42/followers/5')
      .reply(200, { success: true, data: { user_id: 5 } })

    await runCmd(DealFollowerRemoveCommand, ['42', '--user', '5', '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true, {
      default: false,
    })
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(
        DealFollowerRemoveCommand.run(['42', '--user', '5']),
      ).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('requires --user', async () => {
    await expect(DealFollowerRemoveCommand.run(['42'])).rejects.toThrow()
  })

  it('requires the deal id positional', async () => {
    await expect(
      DealFollowerRemoveCommand.run(['--user', '5']),
    ).rejects.toThrow()
  })
})
