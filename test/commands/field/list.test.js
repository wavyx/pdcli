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

const { default: FieldListCommand } =
  await import('../../../src/commands/field/list.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('field list', () => {
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

  it('lists deal fields with their keys', async () => {
    mockApi()
      .get('/api/v2/dealFields')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            field_code: 'title',
            field_name: 'Title',
            field_type: 'varchar',
          },
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
      })

    const stdout = await runCmd(FieldListCommand, ['deal', '--output', 'table'])

    expect(stdout).toContain('Title')
    expect(stdout).toContain('Deal Size')
    expect(stdout).toContain(HASH)
    expect(stdout).toContain('enum')
    expect(stdout).toContain('Small, Large')
  })

  it('maps the org alias to organizationFields', async () => {
    mockApi()
      .get('/api/v2/organizationFields')
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            field_code: 'name',
            field_name: 'Name',
            field_type: 'varchar',
          },
        ],
      })

    const stdout = await runCmd(FieldListCommand, ['org', '--output', 'json'])

    expect(JSON.parse(stdout)).toHaveLength(1)
  })
})
