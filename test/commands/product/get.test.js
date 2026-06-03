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

const { default: ProductGetCommand } =
  await import('../../../src/commands/product/get.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('product get', () => {
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

  it('prints raw JSON (custom fields untouched)', async () => {
    mockApi()
      .get('/api/v2/products/42')
      .reply(200, {
        success: true,
        data: {
          id: 42,
          name: 'Widget',
          custom_fields: { [HASH]: 11 },
        },
      })

    const stdout = await runCmd(ProductGetCommand, ['42', '--output', 'json'])
    const product = JSON.parse(stdout)

    expect(product.id).toBe(42)
    expect(product.custom_fields[HASH]).toBe(11)
  })

  it('resolves custom-field names and option labels in table mode', async () => {
    mockApi()
      .get('/api/v2/products/42')
      .reply(200, {
        success: true,
        data: {
          id: 42,
          name: 'Widget',
          custom_fields: { [HASH]: 11 },
        },
      })
    mockApi()
      .get('/api/v2/productFields')
      .reply(200, {
        success: true,
        data: [
          {
            id: 2,
            field_code: HASH,
            field_name: 'Material',
            field_type: 'enum',
            options: [
              { id: 10, label: 'Steel' },
              { id: 11, label: 'Aluminum' },
            ],
          },
        ],
      })

    const stdout = await runCmd(ProductGetCommand, ['42', '--output', 'table'])

    expect(stdout).toContain('Widget')
    expect(stdout).toContain('Material')
    expect(stdout).toContain('Aluminum')
  })

  it('requires an integer id argument', async () => {
    await expect(ProductGetCommand.run(['not-a-number'])).rejects.toThrow()
  })
})
