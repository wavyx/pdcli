import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const mockConfirm = vi.fn()
vi.mock('../../../../src/lib/confirm.js', () => ({
  confirmAction: mockConfirm,
}))

const clearFieldsCacheSpy = vi.fn()
vi.mock('../../../../src/lib/fields.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    clearFieldsCache: (...args) => {
      clearFieldsCacheSpy(...args)
      return actual.clearFieldsCache(...args)
    },
  }
})

const { default: FieldOptionRemoveCommand } =
  await import('../../../../src/commands/field/option/remove.js')
import { runCmd, mockApi } from '../../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('field option remove', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCacheSpy.mockClear()
    mockConfirm.mockReset()
    mockConfirm.mockResolvedValue(true)
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('removes an option via an array body and clears the cache', async () => {
    mockApi()
      .delete(`/api/v2/dealFields/${HASH}/options`, [{ id: 4 }])
      .reply(200, {
        success: true,
        data: [{ id: 4, label: 'Critical' }],
        additional_data: null,
      })

    const stdout = await runCmd(FieldOptionRemoveCommand, [
      'deal',
      HASH,
      '--option',
      '4',
      '--yes',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].id).toBe(4)
    expect(clearFieldsCacheSpy).toHaveBeenCalledTimes(1)
  })

  it('confirms before removing (records keep no trace of the option)', async () => {
    mockConfirm.mockResolvedValue(false)

    const err = await FieldOptionRemoveCommand.run([
      'deal',
      HASH,
      '--option',
      '4',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(1)
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.stringMatching(/remove option 4/i),
      false,
      { default: false },
    )
  })

  it('rejects a non-numeric --option with exit 64', async () => {
    const err = await FieldOptionRemoveCommand.run([
      'deal',
      HASH,
      '--option',
      'abc',
      '--yes',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('renders an empty list when the API returns no data', async () => {
    mockApi()
      .delete(`/api/v2/dealFields/${HASH}/options`)
      .reply(200, { success: true })

    const stdout = await runCmd(FieldOptionRemoveCommand, [
      'deal',
      HASH,
      '--option',
      '4',
      '--yes',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual([])
  })
})
