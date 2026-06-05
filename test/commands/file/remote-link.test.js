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

const { default: FileRemoteLinkCommand } =
  await import('../../../src/commands/file/remote-link.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('file remote-link', () => {
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

  it('links a remote file to a deal with a form-encoded body', async () => {
    const scope = mockApi()
      .post('/api/v1/files/remoteLink', (body) => {
        // nock parses x-www-form-urlencoded bodies into a plain object.
        return (
          body.item_type === 'deal' &&
          body.item_id === '42' &&
          body.remote_id === 'gdrive-abc' &&
          body.remote_location === 'googledrive'
        )
      })
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .reply(200, {
        success: true,
        data: { id: 7, deal_id: 42, remote_location: 'googledrive' },
      })

    const stdout = await runCmd(FileRemoteLinkCommand, [
      '--deal',
      '42',
      '--remote-id',
      'gdrive-abc',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(7)
    expect(scope.isDone()).toBe(true)
  })

  it('links to an organization', async () => {
    const scope = mockApi()
      .post('/api/v1/files/remoteLink', (body) => {
        return body.item_type === 'organization' && body.item_id === '5'
      })
      .reply(200, { success: true, data: { id: 8 } })

    const stdout = await runCmd(FileRemoteLinkCommand, [
      '--org',
      '5',
      '--remote-id',
      'g1',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(8)
    expect(scope.isDone()).toBe(true)
  })

  it('links to a person', async () => {
    const scope = mockApi()
      .post('/api/v1/files/remoteLink', (body) => {
        return body.item_type === 'person' && body.item_id === '9'
      })
      .reply(200, { success: true, data: { id: 11 } })

    const stdout = await runCmd(FileRemoteLinkCommand, [
      '--person',
      '9',
      '--remote-id',
      'g2',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(11)
    expect(scope.isDone()).toBe(true)
  })

  it('renders a field/value table by default', async () => {
    mockApi()
      .post('/api/v1/files/remoteLink')
      .reply(200, {
        success: true,
        data: { id: 7, remote_location: 'googledrive' },
      })

    const stdout = await runCmd(FileRemoteLinkCommand, [
      '--deal',
      '42',
      '--remote-id',
      'g3',
      '--output',
      'table',
    ])

    expect(stdout).toContain('googledrive')
    expect(stdout).toContain('Field')
  })

  it('rejects when no item flag is given', async () => {
    nock.disableNetConnect()
    try {
      await expect(
        FileRemoteLinkCommand.run(['--remote-id', 'g1']),
      ).rejects.toMatchObject({
        message: 'Pass exactly one of --deal, --org, or --person',
        oclif: { exit: 64 },
      })
    } finally {
      nock.enableNetConnect()
    }
  })

  it('rejects when more than one item flag is given', async () => {
    nock.disableNetConnect()
    try {
      await expect(
        FileRemoteLinkCommand.run([
          '--deal',
          '42',
          '--person',
          '9',
          '--remote-id',
          'g1',
        ]),
      ).rejects.toMatchObject({
        message: 'Pass exactly one of --deal, --org, or --person',
        oclif: { exit: 64 },
      })
    } finally {
      nock.enableNetConnect()
    }
  })
})
