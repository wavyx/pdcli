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

const { default: NoteUpdateCommand } =
  await import('../../../src/commands/note/update.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('note update', () => {
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

  it('PUTs the new content', async () => {
    mockApi()
      .put('/api/v1/notes/5', { content: 'Updated note' })
      .reply(200, {
        success: true,
        data: { id: 5, content: 'Updated note' },
      })

    const stdout = await runCmd(NoteUpdateCommand, [
      '5',
      '--content',
      'Updated note',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).content).toBe('Updated note')
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .put('/api/v1/notes/5', { content: 'Flag wins', pinned_to_deal_flag: 1 })
      .reply(200, { success: true, data: { id: 5 } })

    const stdout = await runCmd(NoteUpdateCommand, [
      '5',
      '--content',
      'Flag wins',
      '--body',
      '{"content":"Body content","pinned_to_deal_flag":1}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(5)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(NoteUpdateCommand.run(['5'])).rejects.toThrow(
      /nothing to update/i,
    )
  })
})
