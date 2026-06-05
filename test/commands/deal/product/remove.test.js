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

const { default: DealProductRemoveCommand } =
  await import('../../../../src/commands/deal/product/remove.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('deal product remove', () => {
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
      .delete('/api/v2/deals/42/products/3')
      .reply(200, { success: true, data: { id: 3 } })

    const stdout = await runCmd(DealProductRemoveCommand, [
      '42',
      '--attachment',
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
      .delete('/api/v2/deals/42/products/3')
      .reply(200, { success: true, data: { id: 3 } })

    await runCmd(DealProductRemoveCommand, ['42', '--attachment', '3', '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(
        DealProductRemoveCommand.run(['42', '--attachment', '3']),
      ).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('requires --attachment', async () => {
    await expect(DealProductRemoveCommand.run(['42'])).rejects.toThrow()
  })

  it('requires the deal id positional', async () => {
    await expect(
      DealProductRemoveCommand.run(['--attachment', '3']),
    ).rejects.toThrow()
  })
})
