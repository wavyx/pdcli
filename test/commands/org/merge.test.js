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

const mockConfirmAction = vi.fn()
vi.mock('../../../src/lib/confirm.js', () => ({
  confirmAction: mockConfirmAction,
}))

const { default: OrgMergeCommand } =
  await import('../../../src/commands/org/merge.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('org merge', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockConfirmAction.mockReset()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('merges then re-fetches and prints the survivor organization', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const mergeScope = mockApi()
      .put('/api/v1/organizations/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    const fetchScope = mockApi()
      .get('/api/v2/organizations/456')
      .reply(200, {
        success: true,
        data: { id: 456, name: 'Survivor Org' },
      })

    const stdout = await runCmd(OrgMergeCommand, [
      '123',
      '--into',
      '456',
      '--output',
      'json',
    ])

    expect(mergeScope.isDone()).toBe(true)
    expect(fetchScope.isDone()).toBe(true)
    expect(JSON.parse(stdout).id).toBe(456)
    expect(JSON.parse(stdout).name).toBe('Survivor Org')
  })

  it('confirms naming the record that will be deleted', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .put('/api/v1/organizations/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    mockApi()
      .get('/api/v2/organizations/456')
      .reply(200, { success: true, data: { id: 456, name: 'Survivor Org' } })

    await runCmd(OrgMergeCommand, ['123', '--into', '456', '--output', 'json'])

    const [message, skip] = mockConfirmAction.mock.calls[0]
    expect(message).toContain('123')
    expect(message).toContain('456')
    expect(message).toMatch(/123 will be deleted/i)
    expect(skip).toBe(false)
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const mergeScope = mockApi()
      .put('/api/v1/organizations/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    mockApi()
      .get('/api/v2/organizations/456')
      .reply(200, { success: true, data: { id: 456, name: 'Survivor Org' } })

    await runCmd(OrgMergeCommand, [
      '123',
      '--into',
      '456',
      '--yes',
      '--output',
      'json',
    ])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(mergeScope.isDone()).toBe(true)
  })

  it('skips the prompt with -y', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const mergeScope = mockApi()
      .put('/api/v1/organizations/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    mockApi()
      .get('/api/v2/organizations/456')
      .reply(200, { success: true, data: { id: 456, name: 'Survivor Org' } })

    await runCmd(OrgMergeCommand, [
      '123',
      '--into',
      '456',
      '-y',
      '--output',
      'json',
    ])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(mergeScope.isDone()).toBe(true)
  })

  it('aborts without calling the API when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(
        OrgMergeCommand.run(['123', '--into', '456']),
      ).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('rejects merging a record into itself (exit 64)', async () => {
    nock.disableNetConnect()

    try {
      await expect(
        OrgMergeCommand.run(['123', '--into', '123']),
      ).rejects.toThrow(/cannot merge/i)
      expect(mockConfirmAction).not.toHaveBeenCalled()
    } finally {
      nock.enableNetConnect()
    }
  })
})
