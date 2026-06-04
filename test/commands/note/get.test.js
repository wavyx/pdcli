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

const { default: NoteGetCommand } =
  await import('../../../src/commands/note/get.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('note get', () => {
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

  it('prints the note as JSON', async () => {
    mockApi()
      .get('/api/v1/notes/5')
      .reply(200, {
        success: true,
        data: { id: 5, content: 'Follow up next week' },
      })

    const stdout = await runCmd(NoteGetCommand, ['5', '--output', 'json'])
    const note = JSON.parse(stdout)

    expect(note.id).toBe(5)
    expect(note.content).toBe('Follow up next week')
  })

  it('renders a field/value table', async () => {
    mockApi()
      .get('/api/v1/notes/5')
      .reply(200, {
        success: true,
        data: { id: 5, content: 'Table note' },
      })

    const stdout = await runCmd(NoteGetCommand, ['5', '--output', 'table'])

    expect(stdout).toContain('Table note')
  })

  it('requires an integer id argument', async () => {
    await expect(NoteGetCommand.run(['not-a-number'])).rejects.toThrow()
  })
})
