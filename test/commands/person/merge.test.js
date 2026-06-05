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

  it('merges the loser into the survivor and prints the survivor record', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, {
        success: true,
        data: { id: 456, name: 'Survivor', merge_what_id: 123 },
      })

    const stdout = await runCmd(PersonMergeCommand, [
      '123',
      '--into',
      '456',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(stdout).id).toBe(456)
    expect(JSON.parse(stdout).name).toBe('Survivor')
  })

  it('confirms naming the record that will be deleted', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })

    await runCmd(PersonMergeCommand, [
      '123',
      '--into',
      '456',
      '--output',
      'json',
    ])

    const [message, skip] = mockConfirmAction.mock.calls[0]
    expect(message).toContain('123')
    expect(message).toContain('456')
    expect(message).toMatch(/123 will be deleted/i)
    expect(skip).toBe(false)
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })

    await runCmd(PersonMergeCommand, [
      '123',
      '--into',
      '456',
      '--yes',
      '--output',
      'json',
    ])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(scope.isDone()).toBe(true)
  })

  it('skips the prompt with -y', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .put('/api/v1/persons/123/merge', { merge_with_id: 456 })
      .reply(200, { success: true, data: { id: 456 } })

    await runCmd(PersonMergeCommand, [
      '123',
      '--into',
      '456',
      '-y',
      '--output',
      'json',
    ])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without calling the API when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(
        PersonMergeCommand.run(['123', '--into', '456']),
      ).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
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
})
