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

const { default: NoteCommentAddCommand } =
  await import('../../../../src/commands/note/comment/add.js')
import { runCmd, mockApi } from '../../../helpers.js'

const UUID = '46c3b0e1-db35-59ca-1828-4817378dff71'

describe('note comment add', () => {
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

  it('POSTs the content to the note comments endpoint', async () => {
    mockApi()
      .post('/api/v1/notes/5/comments', { content: 'Nice work' })
      .reply(200, {
        success: true,
        data: { uuid: UUID, content: 'Nice work' },
      })

    const stdout = await runCmd(NoteCommentAddCommand, [
      '5',
      '--content',
      'Nice work',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).uuid).toBe(UUID)
  })
})
