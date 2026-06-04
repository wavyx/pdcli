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

const { default: ProductCreateCommand } =
  await import('../../../src/commands/product/create.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('product create', () => {
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

  it('POSTs typed flags as a v2 body and prints the created product', async () => {
    mockApi()
      .post('/api/v2/products', {
        name: 'Widget',
        code: 'W-1',
        unit: 'each',
        owner_id: 3,
        prices: [{ price: 9.99, currency: 'EUR' }],
      })
      .reply(201, {
        success: true,
        data: { id: 99, name: 'Widget' },
      })

    const stdout = await runCmd(ProductCreateCommand, [
      '--name',
      'Widget',
      '--code',
      'W-1',
      '--unit',
      'each',
      '--owner',
      '3',
      '--price',
      '9.99',
      '--currency',
      'EUR',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(99)
  })

  it('omits prices when neither price nor currency is given', async () => {
    mockApi()
      .post('/api/v2/products', { name: 'Plain', description: 'No price' })
      .reply(201, { success: true, data: { id: 100, name: 'Plain' } })

    const stdout = await runCmd(ProductCreateCommand, [
      '--name',
      'Plain',
      '--description',
      'No price',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(100)
  })

  it('resolves --field custom fields into custom_fields', async () => {
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
            is_custom_field: true,
            options: [
              { id: 10, label: 'Steel' },
              { id: 11, label: 'Aluminum' },
            ],
          },
        ],
      })
    mockApi()
      .post('/api/v2/products', {
        name: 'Sized product',
        custom_fields: { [HASH]: 11 },
      })
      .reply(201, {
        success: true,
        data: { id: 101, name: 'Sized product' },
      })

    const stdout = await runCmd(ProductCreateCommand, [
      '--name',
      'Sized product',
      '--field',
      'Material=Aluminum',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(101)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v2/products', {
        name: 'Flag wins',
        tax: 19,
      })
      .reply(201, { success: true, data: { id: 102 } })

    const stdout = await runCmd(ProductCreateCommand, [
      '--name',
      'Flag wins',
      '--body',
      '{"name":"Body name","tax":19}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(102)
  })

  it('requires --name', async () => {
    await expect(ProductCreateCommand.run([])).rejects.toThrow()
  })

  it('requires --currency when --price is given', async () => {
    await expect(
      ProductCreateCommand.run(['--name', 'Widget', '--price', '9.99']),
    ).rejects.toThrow()
  })
})
