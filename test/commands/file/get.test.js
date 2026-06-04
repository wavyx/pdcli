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

const { default: FileGetCommand } =
  await import('../../../src/commands/file/get.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('file get', () => {
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

  it('prints the file as raw JSON', async () => {
    mockApi()
      .get('/api/v1/files/5')
      .reply(200, {
        success: true,
        data: { id: 5, name: 'note.txt' },
      })

    const stdout = await runCmd(FileGetCommand, ['5', '--output', 'json'])

    expect(JSON.parse(stdout).name).toBe('note.txt')
  })

  it('renders a field/value table', async () => {
    mockApi()
      .get('/api/v1/files/8')
      .reply(200, {
        success: true,
        data: { id: 8, name: 'doc.pdf' },
      })

    const stdout = await runCmd(FileGetCommand, ['8', '--output', 'table'])

    expect(stdout).toContain('doc.pdf')
    expect(stdout).toContain('Field')
  })
})
