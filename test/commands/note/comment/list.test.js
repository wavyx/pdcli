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

const { default: NoteCommentListCommand } =
  await import('../../../../src/commands/note/comment/list.js')
import { runCmd, mockApi } from '../../../helpers.js'

const UUID = '46c3b0e1-db35-59ca-1828-4817378dff71'

describe('note comment list', () => {
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

  it('lists comments for a note', async () => {
    mockApi()
      .get('/api/v1/notes/5/comments')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ uuid: UUID, content: 'This is a comment', user_id: 8877 }],
      })

    const stdout = await runCmd(NoteCommentListCommand, [
      '5',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].uuid).toBe(UUID)
  })

  it('truncates long content to 60 chars in the table view', async () => {
    const long = 'x'.repeat(120)
    mockApi()
      .get('/api/v1/notes/5/comments')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ uuid: UUID, content: long }],
      })

    const stdout = await runCmd(NoteCommentListCommand, [
      '5',
      '--output',
      'table',
    ])

    expect(stdout).toContain('x'.repeat(60))
    expect(stdout).not.toContain('x'.repeat(61))
  })

  it('renders an empty content cell when content is missing', async () => {
    mockApi()
      .get('/api/v1/notes/5/comments')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ uuid: UUID }],
      })

    const stdout = await runCmd(NoteCommentListCommand, [
      '5',
      '--output',
      'table',
    ])

    expect(stdout).toContain(UUID)
  })

  it('follows v1 offset pagination across pages', async () => {
    mockApi()
      .get('/api/v1/notes/5/comments')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ uuid: 'a' }],
        additional_data: {
          pagination: { more_items_in_collection: true, next_start: 100 },
        },
      })
    mockApi()
      .get('/api/v1/notes/5/comments')
      .query({ limit: '100', start: '100' })
      .reply(200, {
        success: true,
        data: [{ uuid: 'b' }],
        additional_data: {
          pagination: { more_items_in_collection: false },
        },
      })

    const stdout = await runCmd(NoteCommentListCommand, [
      '5',
      '--output',
      'json',
    ])

    const rows = JSON.parse(stdout)
    expect(rows.map((r) => r.uuid)).toEqual(['a', 'b'])
  })
})
