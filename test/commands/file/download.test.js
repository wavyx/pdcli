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

const mockWriteFileSync = vi.fn()
vi.mock('node:fs', () => ({
  writeFileSync: (...args) => mockWriteFileSync(...args),
}))

const { default: FileDownloadCommand } =
  await import('../../../src/commands/file/download.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('file download', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockWriteFileSync.mockReset()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('downloads to the file name returned by the API by default', async () => {
    mockApi()
      .get('/api/v1/files/5')
      .reply(200, { success: true, data: { id: 5, name: 'note.txt' } })
    mockApi()
      .get('/api/v1/files/5/download')
      .reply(200, Buffer.from('hello bytes'), {
        'content-type': 'text/plain',
      })

    const stdout = await runCmd(FileDownloadCommand, ['5'])

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
    const [path, data] = mockWriteFileSync.mock.calls[0]
    expect(path).toBe('note.txt')
    expect(Buffer.from(data).toString()).toBe('hello bytes')
    expect(stdout).toContain('Saved note.txt')
    expect(stdout).toContain('11 bytes')
  })

  it('downloads to an explicit --out path', async () => {
    mockApi()
      .get('/api/v1/files/5')
      .reply(200, { success: true, data: { id: 5, name: 'note.txt' } })
    mockApi()
      .get('/api/v1/files/5/download')
      .reply(200, Buffer.from('PDF'), { 'content-type': 'application/pdf' })

    const stdout = await runCmd(FileDownloadCommand, [
      '5',
      '--out',
      '/tmp/x.bin',
    ])

    const [path, data] = mockWriteFileSync.mock.calls[0]
    expect(path).toBe('/tmp/x.bin')
    expect(Buffer.from(data).toString()).toBe('PDF')
    expect(stdout).toContain('Saved /tmp/x.bin')
  })
})
