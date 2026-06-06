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

const { default: FieldCreateCommand } =
  await import('../../../src/commands/field/create.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('field create', () => {
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

  it('creates a simple deal field', async () => {
    mockApi()
      .post('/api/v2/dealFields', {
        field_name: 'Budget',
        field_type: 'double',
      })
      .reply(200, {
        success: true,
        data: {
          id: 5,
          field_code: HASH,
          field_name: 'Budget',
          field_type: 'double',
        },
      })

    const stdout = await runCmd(FieldCreateCommand, [
      'deal',
      '--name',
      'Budget',
      '--type',
      'double',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).field_code).toBe(HASH)
  })

  it('creates an enum field with options', async () => {
    mockApi()
      .post('/api/v2/personFields', {
        field_name: 'Tier',
        field_type: 'enum',
        options: [{ label: 'Gold' }, { label: 'Silver' }, { label: 'Bronze' }],
      })
      .reply(200, {
        success: true,
        data: {
          id: 6,
          field_code: HASH,
          field_name: 'Tier',
          field_type: 'enum',
          options: [
            { id: 1, label: 'Gold' },
            { id: 2, label: 'Silver' },
            { id: 3, label: 'Bronze' },
          ],
        },
      })

    const stdout = await runCmd(FieldCreateCommand, [
      'person',
      '--name',
      'Tier',
      '--type',
      'enum',
      '--options',
      'Gold, Silver, Bronze',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).field_name).toBe('Tier')
  })

  it('clears the fields cache after a successful create', async () => {
    mockApi()
      .post('/api/v2/dealFields')
      .reply(200, {
        success: true,
        data: { id: 5, field_code: HASH, field_name: 'X', field_type: 'text' },
      })

    await runCmd(FieldCreateCommand, [
      'deal',
      '--name',
      'X',
      '--type',
      'text',
      '--output',
      'json',
    ])

    expect(clearFieldsCacheSpy).toHaveBeenCalledTimes(1)
  })

  it('renders the created field as a table', async () => {
    mockApi()
      .post('/api/v2/dealFields')
      .reply(200, {
        success: true,
        data: {
          id: 5,
          field_code: HASH,
          field_name: 'Budget',
          field_type: 'double',
        },
      })

    const stdout = await runCmd(FieldCreateCommand, [
      'deal',
      '--name',
      'Budget',
      '--type',
      'double',
      '--output',
      'table',
    ])

    expect(stdout).toContain('Budget')
    expect(stdout).toContain(HASH)
  })

  it('rejects enum/set fields with no --options (exit 64)', async () => {
    await expect(
      FieldCreateCommand.run(['deal', '--name', 'Tier', '--type', 'enum']),
    ).rejects.toThrow(/options/i)
  })

  it('renders a created field without options in table mode', async () => {
    mockApi()
      .post('/api/v2/dealFields')
      .reply(200, {
        success: true,
        data: { id: 90, field_code: 'f'.repeat(40), field_name: 'Plain' },
      })

    const stdout = await runCmd(FieldCreateCommand, [
      'deal',
      '--name',
      'Plain',
      '--type',
      'varchar',
      '--output',
      'table',
    ])
    expect(stdout).toContain('Plain')
  })

  it('renders enum options as id=label pairs in table mode', async () => {
    mockApi()
      .post('/api/v2/dealFields')
      .reply(200, {
        success: true,
        data: {
          id: 91,
          field_code: 'a'.repeat(40),
          field_name: 'Tier',
          options: [
            { id: 1, label: 'Gold' },
            { id: 2, label: 'Silver' },
          ],
        },
      })

    const stdout = await runCmd(FieldCreateCommand, [
      'deal',
      '--name',
      'Tier',
      '--type',
      'enum',
      '--options',
      'Gold,Silver',
      '--output',
      'table',
    ])
    expect(stdout).toContain('1=Gold')
    expect(stdout).toContain('2=Silver')
  })
})
