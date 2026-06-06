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

const { default: NoteCommentUpdateCommand } =
  await import('../../../../src/commands/note/comment/update.js')
import { runCmd, mockApi } from '../../../helpers.js'

const UUID = '46c3b0e1-db35-59ca-1828-4817378dff71'

describe('note comment update', () => {
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

  it('PUTs the new content to the comment by UUID', async () => {
    mockApi()
      .put(`/api/v1/notes/5/comments/${UUID}`, { content: 'Edited comment' })
      .reply(200, {
        success: true,
        data: { uuid: UUID, content: 'Edited comment' },
      })

    const stdout = await runCmd(NoteCommentUpdateCommand, [
      '5',
      '--comment',
      UUID,
      '--content',
      'Edited comment',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).content).toBe('Edited comment')
  })
})
