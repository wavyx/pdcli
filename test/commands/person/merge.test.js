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

const { default: PersonMergeCommand } =
  await import('../../../src/commands/person/merge.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('person merge', () => {
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

  it('looks up both records, merges, then re-fetches the survivor (v2)', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const loserScope = mockApi()
      .get('/api/v2/persons/123')
      .reply(200, { success: true, data: { id: 123, name: 'John Smith' } })
    const winnerScope = mockApi()
      .get('/api/v2/persons/456')
      .reply(200, { success: true, data: { id: 456, name: 'Jon Smith' } })
    const mergeScope = mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    const refetchScope = mockApi()
      .get('/api/v2/persons/456')
      .reply(200, {
        success: true,
        data: { id: 456, name: 'Jon Smith', org_id: 7 },
      })

    const stdout = await runCmd(PersonMergeCommand, [
      '123',
      '--into',
      '456',
      '--output',
      'json',
    ])

    expect(loserScope.isDone()).toBe(true)
    expect(winnerScope.isDone()).toBe(true)
    expect(mergeScope.isDone()).toBe(true)
    expect(refetchScope.isDone()).toBe(true)
    const out = JSON.parse(stdout)
    expect(out.id).toBe(456)
    expect(out.org_id).toBe(7)
  })

  it('confirms with both record names and defaults to NO', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .get('/api/v2/persons/123')
      .reply(200, { success: true, data: { id: 123, name: 'John Smith' } })
    mockApi()
      .get('/api/v2/persons/456')
      .reply(200, { success: true, data: { id: 456, name: 'Jon Smith' } })
    mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    mockApi()
      .get('/api/v2/persons/456')
      .reply(200, { success: true, data: { id: 456, name: 'Jon Smith' } })

    await runCmd(PersonMergeCommand, [
      '123',
      '--into',
      '456',
      '--output',
      'json',
    ])

    const [message, skip, options] = mockConfirmAction.mock.calls[0]
    expect(message).toContain('123')
    expect(message).toContain('456')
    expect(message).toContain('John Smith')
    expect(message).toContain('Jon Smith')
    expect(message).toMatch(/DELETED/i)
    expect(skip).toBe(false)
    expect(options).toEqual({ default: false })
  })

  it('fails before any merge when the loser lookup 404s', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const loserScope = mockApi()
      .get('/api/v2/persons/123')
      .reply(404, { success: false, error: 'Person not found' })

    await expect(
      PersonMergeCommand.run(['123', '--into', '456']),
    ).rejects.toThrow(/404|not found/i)

    expect(loserScope.isDone()).toBe(true)
    expect(mockConfirmAction).not.toHaveBeenCalled()
  })

  it('fails before any merge when the survivor lookup 404s', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .get('/api/v2/persons/123')
      .reply(200, { success: true, data: { id: 123, name: 'John Smith' } })
    const winnerScope = mockApi()
      .get('/api/v2/persons/456')
      .reply(404, { success: false, error: 'Person not found' })

    await expect(
      PersonMergeCommand.run(['123', '--into', '456']),
    ).rejects.toThrow(/404|not found/i)

    expect(winnerScope.isDone()).toBe(true)
    expect(mockConfirmAction).not.toHaveBeenCalled()
  })

  it('skips the lookups and prompt with --yes', async () => {
    const mergeScope = mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    const refetchScope = mockApi()
      .get('/api/v2/persons/456')
      .reply(200, { success: true, data: { id: 456, name: 'Jon Smith' } })

    await runCmd(PersonMergeCommand, [
      '123',
      '--into',
      '456',
      '--yes',
      '--output',
      'json',
    ])

    expect(mockConfirmAction).not.toHaveBeenCalled()
    expect(mergeScope.isDone()).toBe(true)
    expect(refetchScope.isDone()).toBe(true)
  })

  it('skips the lookups and prompt with -y', async () => {
    const mergeScope = mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    mockApi()
      .get('/api/v2/persons/456')
      .reply(200, { success: true, data: { id: 456, name: 'Jon Smith' } })

    await runCmd(PersonMergeCommand, [
      '123',
      '--into',
      '456',
      '-y',
      '--output',
      'json',
    ])

    expect(mockConfirmAction).not.toHaveBeenCalled()
    expect(mergeScope.isDone()).toBe(true)
  })

  it('aborts without merging when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    const loserScope = mockApi()
      .get('/api/v2/persons/123')
      .reply(200, { success: true, data: { id: 123, name: 'John Smith' } })
    const winnerScope = mockApi()
      .get('/api/v2/persons/456')
      .reply(200, { success: true, data: { id: 456, name: 'Jon Smith' } })

    await expect(
      PersonMergeCommand.run(['123', '--into', '456']),
    ).rejects.toThrow(/abort/i)

    expect(loserScope.isDone()).toBe(true)
    expect(winnerScope.isDone()).toBe(true)
  })

  it('rejects merging a record into itself (exit 64)', async () => {
    nock.disableNetConnect()

    try {
      await expect(
        PersonMergeCommand.run(['123', '--into', '123']),
      ).rejects.toThrow(/cannot merge/i)
      expect(mockConfirmAction).not.toHaveBeenCalled()
    } finally {
      nock.enableNetConnect()
    }
  })

  it('still succeeds (exit 0) with a warning when the survivor re-fetch 404s', async () => {
    const mergeScope = mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })
    const refetchScope = mockApi()
      .get('/api/v2/persons/456')
      .reply(404, { success: false, error: 'Person not found' })

    const warnings = []
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...chunk) => {
      warnings.push(chunk.map(String).join(' '))
    })

    let stdout
    try {
      stdout = await runCmd(PersonMergeCommand, [
        '123',
        '--into',
        '456',
        '--yes',
        '--output',
        'json',
      ])
    } finally {
      errSpy.mockRestore()
    }

    expect(mergeScope.isDone()).toBe(true)
    expect(refetchScope.isDone()).toBe(true)
    expect(JSON.parse(stdout).id).toBe(456)
    expect(warnings.join('')).toMatch(/could not load the survivor/i)
  })
})
