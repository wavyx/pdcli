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

const mockReadFileSync = vi.fn()
vi.mock('node:fs', () => ({
  readFileSync: (...args) => mockReadFileSync(...args),
}))

const { default: FileUploadCommand } =
  await import('../../../src/commands/file/upload.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('file upload', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockReadFileSync.mockReset()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('uploads a file with no associations', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('hello upload'))
    const scope = mockApi()
      .post('/api/v1/files', (body) => {
        const s = String(body)
        return (
          s.includes('name="file"') &&
          s.includes('filename="note.txt"') &&
          s.includes('hello upload')
        )
      })
      .reply(201, { success: true, data: { id: 9, name: 'note.txt' } })

    const stdout = await runCmd(FileUploadCommand, [
      '/some/dir/note.txt',
      '--output',
      'json',
    ])

    expect(mockReadFileSync).toHaveBeenCalledWith('/some/dir/note.txt')
    expect(JSON.parse(stdout).id).toBe(9)
    expect(scope.isDone()).toBe(true)
  })

  it('attaches the file to a deal, person, and organization', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('data'))
    const scope = mockApi()
      .post('/api/v1/files', (body) => {
        const s = String(body)
        return (
          s.includes('name="deal_id"') &&
          s.includes('42') &&
          s.includes('name="person_id"') &&
          s.includes('7') &&
          s.includes('name="org_id"') &&
          s.includes('3')
        )
      })
      .reply(201, { success: true, data: { id: 10, name: 'report.csv' } })

    const stdout = await runCmd(FileUploadCommand, [
      '/some/dir/report.csv',
      '--deal',
      '42',
      '--person',
      '7',
      '--org',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(10)
    expect(scope.isDone()).toBe(true)
  })
})
