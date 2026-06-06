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

const { default: FileUpdateCommand } =
  await import('../../../src/commands/file/update.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('file update', () => {
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

  it('PUTs the new name as a urlencoded form', async () => {
    mockApi()
      .put('/api/v1/files/5', (body) => {
        const params = new URLSearchParams(body)
        return (
          params.get('name') === 'renamed.pdf' && !params.has('description')
        )
      })
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .reply(200, { success: true, data: { id: 5, name: 'renamed.pdf' } })

    const stdout = await runCmd(FileUpdateCommand, [
      '5',
      '--name',
      'renamed.pdf',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).name).toBe('renamed.pdf')
  })

  it('PUTs both name and description', async () => {
    mockApi()
      .put('/api/v1/files/5', (body) => {
        const params = new URLSearchParams(body)
        return (
          params.get('name') === 'renamed.pdf' &&
          params.get('description') === 'Q3 report'
        )
      })
      .reply(200, { success: true, data: { id: 5 } })

    const stdout = await runCmd(FileUpdateCommand, [
      '5',
      '--name',
      'renamed.pdf',
      '--description',
      'Q3 report',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(5)
  })

  it('PUTs only the description', async () => {
    mockApi()
      .put('/api/v1/files/5', (body) => {
        const params = new URLSearchParams(body)
        return params.get('description') === 'New desc' && !params.has('name')
      })
      .reply(200, { success: true, data: { id: 5 } })

    const stdout = await runCmd(FileUpdateCommand, [
      '5',
      '--description',
      'New desc',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(5)
  })

  it('rejects an update with no fields (exit 64)', async () => {
    await expect(FileUpdateCommand.run(['5'])).rejects.toThrow(
      /at least one of/i,
    )
  })
})
