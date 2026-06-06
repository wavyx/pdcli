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

const { default: FieldOptionAddCommand } =
  await import('../../../../src/commands/field/option/add.js')
import { runCmd, mockApi } from '../../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('field option add', () => {
  beforeEach(() => {
    nock.cleanAll()
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

  it('adds an option to a deal field via an array body', async () => {
    mockApi()
      .post(`/api/v2/dealFields/${HASH}/options`, [{ label: 'Critical' }])
      .reply(200, {
        success: true,
        data: [{ id: 4, label: 'Critical' }],
        additional_data: null,
      })

    const stdout = await runCmd(FieldOptionAddCommand, [
      'deal',
      HASH,
      '--label',
      'Critical',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].label).toBe('Critical')
  })

  it('clears the fields cache after a successful add', async () => {
    mockApi()
      .post(`/api/v2/personFields/${HASH}/options`, [{ label: 'New' }])
      .reply(200, {
        success: true,
        data: [{ id: 9, label: 'New' }],
        additional_data: null,
      })

    await runCmd(FieldOptionAddCommand, [
      'person',
      HASH,
      '--label',
      'New',
      '--output',
      'json',
    ])

    expect(clearFieldsCacheSpy).toHaveBeenCalledTimes(1)
  })

  it('renders the added option as a table', async () => {
    mockApi()
      .post(`/api/v2/dealFields/${HASH}/options`, [{ label: 'Critical' }])
      .reply(200, {
        success: true,
        data: [{ id: 4, label: 'Critical' }],
        additional_data: null,
      })

    const stdout = await runCmd(FieldOptionAddCommand, [
      'deal',
      HASH,
      '--label',
      'Critical',
      '--output',
      'table',
    ])

    expect(stdout).toContain('Critical')
    expect(stdout).toContain('4')
  })

  it('renders an empty list when the API returns no data', async () => {
    mockApi()
      .post(`/api/v2/dealFields/${HASH}/options`)
      .reply(200, { success: true })

    const stdout = await runCmd(FieldOptionAddCommand, [
      'deal',
      HASH,
      '--label',
      'X',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual([])
  })
})
