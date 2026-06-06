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

const { default: FieldUpdateCommand } =
  await import('../../../src/commands/field/update.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('field update', () => {
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

  it('renames a deal field', async () => {
    mockApi()
      .patch(`/api/v2/dealFields/${HASH}`, { field_name: 'New name' })
      .reply(200, {
        success: true,
        data: {
          id: 5,
          field_code: HASH,
          field_name: 'New name',
          field_type: 'double',
        },
      })

    const stdout = await runCmd(FieldUpdateCommand, [
      'deal',
      HASH,
      '--name',
      'New name',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).field_name).toBe('New name')
  })

  it('clears the fields cache after a successful update', async () => {
    mockApi()
      .patch(`/api/v2/personFields/${HASH}`)
      .reply(200, {
        success: true,
        data: {
          id: 6,
          field_code: HASH,
          field_name: 'Renamed',
          field_type: 'varchar',
        },
      })

    await runCmd(FieldUpdateCommand, [
      'person',
      HASH,
      '--name',
      'Renamed',
      '--output',
      'json',
    ])

    expect(clearFieldsCacheSpy).toHaveBeenCalledTimes(1)
  })

  it('renders the updated field as a table', async () => {
    mockApi()
      .patch(`/api/v2/dealFields/${HASH}`)
      .reply(200, {
        success: true,
        data: {
          id: 5,
          field_code: HASH,
          field_name: 'New name',
          field_type: 'enum',
          options: [{ id: 1, label: 'A' }],
        },
      })

    const stdout = await runCmd(FieldUpdateCommand, [
      'deal',
      HASH,
      '--name',
      'New name',
      '--output',
      'table',
    ])

    expect(stdout).toContain('New name')
    expect(stdout).toContain('1=A')
  })
})
