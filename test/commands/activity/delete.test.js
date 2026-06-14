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

const mockConfirmAction = vi.fn()
vi.mock('../../../src/lib/confirm.js', () => ({
  confirmAction: mockConfirmAction,
}))

const { default: ActivityDeleteCommand } =
  await import('../../../src/commands/activity/delete.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('activity delete', () => {
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

  it('deletes after confirmation', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v2/activities/9')
      .reply(200, { success: true, data: { id: 9 } })

    const stdout = await runCmd(ActivityDeleteCommand, ['9'])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining('9'),
      false,
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Deleted')
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v2/activities/9')
      .reply(200, { success: true, data: { id: 9 } })

    await runCmd(ActivityDeleteCommand, ['9', '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(ActivityDeleteCommand.run(['9'])).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('emits a JSON object with --output json', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .delete('/api/v2/activities/9')
      .reply(200, { success: true, data: { id: 9 } })

    const stdout = await runCmd(ActivityDeleteCommand, [
      '9',
      '--yes',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({ id: 9, deleted: true })
  })
})
