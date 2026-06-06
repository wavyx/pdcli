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

const { default: NoteCommentDeleteCommand } =
  await import('../../../../src/commands/note/comment/delete.js')
import { runCmd, mockApi } from '../../../helpers.js'

const UUID = '46c3b0e1-db35-59ca-1828-4817378dff71'

describe('note comment delete', () => {
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
      .delete(`/api/v1/notes/5/comments/${UUID}`)
      .reply(200, { success: true, data: true })

    const stdout = await runCmd(NoteCommentDeleteCommand, [
      '5',
      '--comment',
      UUID,
    ])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining(UUID),
      false,
      { default: false },
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Deleted')
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete(`/api/v1/notes/5/comments/${UUID}`)
      .reply(200, { success: true, data: true })

    await runCmd(NoteCommentDeleteCommand, ['5', '--comment', UUID, '--yes'])

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
        NoteCommentDeleteCommand.run(['5', '--comment', UUID]),
      ).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })
})
