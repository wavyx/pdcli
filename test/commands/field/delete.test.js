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

const clearFieldsCacheSpy = vi.fn()
vi.mock('../../../src/lib/fields.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    clearFieldsCache: (...args) => {
      clearFieldsCacheSpy(...args)
      return actual.clearFieldsCache(...args)
    },
  }
})

const { default: FieldDeleteCommand } =
  await import('../../../src/commands/field/delete.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('field delete', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockConfirmAction.mockReset()
    clearFieldsCacheSpy.mockClear()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('deletes after confirmation, warning that record data is lost', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete(`/api/v2/dealFields/${HASH}`)
      .reply(200, { success: true, data: { field_code: HASH } })

    const stdout = await runCmd(FieldDeleteCommand, ['deal', HASH])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringMatching(/data.*lost/i),
      false,
      { default: false },
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Deleted')
  })

  it('clears the fields cache after a successful delete', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .delete(`/api/v2/dealFields/${HASH}`)
      .reply(200, { success: true, data: { field_code: HASH } })

    await runCmd(FieldDeleteCommand, ['deal', HASH, '--yes'])

    expect(clearFieldsCacheSpy).toHaveBeenCalledTimes(1)
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete(`/api/v2/personFields/${HASH}`)
      .reply(200, { success: true, data: { field_code: HASH } })

    await runCmd(FieldDeleteCommand, ['person', HASH, '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true, {
      default: false,
    })
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    clearFieldsCacheSpy.mockClear()
    nock.disableNetConnect()

    try {
      await expect(FieldDeleteCommand.run(['deal', HASH])).rejects.toThrow(
        /abort/i,
      )
      expect(clearFieldsCacheSpy).not.toHaveBeenCalled()
    } finally {
      nock.enableNetConnect()
    }
  })
})
