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

const { default: ProductUpdateCommand } =
  await import('../../../src/commands/product/update.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('product update', () => {
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

  it('PATCHes only the provided flags', async () => {
    mockApi()
      .patch('/api/v2/products/42', { name: 'Renamed' })
      .reply(200, {
        success: true,
        data: { id: 42, name: 'Renamed' },
      })

    const stdout = await runCmd(ProductUpdateCommand, [
      '42',
      '--name',
      'Renamed',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).name).toBe('Renamed')
  })

  it('PATCHes a price/currency pair as prices', async () => {
    mockApi()
      .patch('/api/v2/products/42', {
        prices: [{ price: 12.5, currency: 'USD' }],
      })
      .reply(200, {
        success: true,
        data: { id: 42, prices: [{ price: 12.5, currency: 'USD' }] },
      })

    const stdout = await runCmd(ProductUpdateCommand, [
      '42',
      '--price',
      '12.5',
      '--currency',
      'USD',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).prices[0].price).toBe(12.5)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(ProductUpdateCommand.run(['42'])).rejects.toThrow(
      /nothing to update/i,
    )
  })

  it('requires --currency when --price is given', async () => {
    await expect(
      ProductUpdateCommand.run(['42', '--price', '9.99']),
    ).rejects.toThrow()
  })
})
