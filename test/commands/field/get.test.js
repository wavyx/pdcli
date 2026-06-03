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

const { default: FieldGetCommand } =
  await import('../../../src/commands/field/get.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

const FIELDS_REPLY = {
  success: true,
  data: [
    { id: 1, field_code: 'title', field_name: 'Title', field_type: 'varchar' },
    {
      id: 2,
      field_code: HASH,
      field_name: 'Deal Size',
      field_type: 'enum',
      options: [
        { id: 10, label: 'Small' },
        { id: 11, label: 'Large' },
      ],
    },
  ],
}

describe('field get', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('finds a field by human name (case-insensitive)', async () => {
    mockApi().get('/api/v2/dealFields').reply(200, FIELDS_REPLY)

    const stdout = await runCmd(FieldGetCommand, [
      'deal',
      'deal size',
      '--output',
      'json',
    ])

    const field = JSON.parse(stdout)
    expect(field.field_code).toBe(HASH)
    expect(field.options).toHaveLength(2)
  })

  it('finds a field by hashed key', async () => {
    mockApi().get('/api/v2/dealFields').reply(200, FIELDS_REPLY)

    const stdout = await runCmd(FieldGetCommand, [
      'deal',
      HASH,
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).field_name).toBe('Deal Size')
  })

  it('errors with exit 65 when the field does not exist', async () => {
    mockApi().get('/api/v2/dealFields').reply(200, FIELDS_REPLY)

    await expect(FieldGetCommand.run(['deal', 'nonexistent'])).rejects.toThrow(
      /no field/i,
    )
  })
})
