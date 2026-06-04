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

const { default: NoteListCommand } =
  await import('../../../src/commands/note/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('note list', () => {
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

  it('lists notes', async () => {
    mockApi()
      .get('/api/v1/notes')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 5, content: 'Called the lead', deal_id: 1 }],
      })

    const stdout = await runCmd(NoteListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].content).toBe('Called the lead')
  })

  it('truncates long content to 60 chars in the table view', async () => {
    const long = 'x'.repeat(120)
    mockApi()
      .get('/api/v1/notes')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 5, content: long }],
      })

    const stdout = await runCmd(NoteListCommand, ['--output', 'table'])

    expect(stdout).toContain('x'.repeat(60))
    expect(stdout).not.toContain('x'.repeat(61))
  })

  it('renders an empty content cell when content is missing', async () => {
    mockApi()
      .get('/api/v1/notes')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 5 }],
      })

    const stdout = await runCmd(NoteListCommand, ['--output', 'table'])

    expect(stdout).toContain('5')
  })

  it('passes --deal as deal_id', async () => {
    mockApi()
      .get('/api/v1/notes')
      .query({ limit: '100', deal_id: '1' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(NoteListCommand, [
      '--deal',
      '1',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('passes --person as person_id', async () => {
    mockApi()
      .get('/api/v1/notes')
      .query({ limit: '100', person_id: '2' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(NoteListCommand, [
      '--person',
      '2',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('passes --org as org_id', async () => {
    mockApi()
      .get('/api/v1/notes')
      .query({ limit: '100', org_id: '3' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(NoteListCommand, [
      '--org',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })
})
