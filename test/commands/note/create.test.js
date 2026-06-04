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

const { default: NoteCreateCommand } =
  await import('../../../src/commands/note/create.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('note create', () => {
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

  it('POSTs content and prints the created note', async () => {
    mockApi()
      .post('/api/v1/notes', { content: 'Hello world' })
      .reply(201, {
        success: true,
        data: { id: 7, content: 'Hello world' },
      })

    const stdout = await runCmd(NoteCreateCommand, [
      '--content',
      'Hello world',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(7)
  })

  it('attaches the note to typed entity flags', async () => {
    mockApi()
      .post('/api/v1/notes', {
        content: 'Linked note',
        deal_id: 1,
        person_id: 2,
        org_id: 3,
        lead_id: 'abc-123',
      })
      .reply(201, { success: true, data: { id: 8 } })

    const stdout = await runCmd(NoteCreateCommand, [
      '--content',
      'Linked note',
      '--deal',
      '1',
      '--person',
      '2',
      '--org',
      '3',
      '--lead',
      'abc-123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(8)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v1/notes', {
        content: 'Flag wins',
        pinned_to_deal_flag: 1,
      })
      .reply(201, { success: true, data: { id: 9 } })

    const stdout = await runCmd(NoteCreateCommand, [
      '--content',
      'Flag wins',
      '--body',
      '{"content":"Body content","pinned_to_deal_flag":1}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(9)
  })

  it('requires --content', async () => {
    await expect(NoteCreateCommand.run([])).rejects.toThrow()
  })
})
