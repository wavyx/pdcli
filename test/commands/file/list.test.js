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

const { default: FileListCommand } =
  await import('../../../src/commands/file/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('file list', () => {
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

  it('lists files via the v1 endpoint', async () => {
    mockApi()
      .get('/api/v1/files')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 5,
            name: 'note.txt',
            file_type: 'txt',
            file_size: 12,
            deal_id: 42,
            person_id: null,
            add_time: '2026-01-01 00:00:00',
          },
        ],
      })

    const stdout = await runCmd(FileListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].name).toBe('note.txt')
  })
})
