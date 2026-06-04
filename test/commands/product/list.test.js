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

const { default: ProductListCommand } =
  await import('../../../src/commands/product/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('product list', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('lists products', async () => {
    mockApi()
      .get('/api/v2/products')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 7, name: 'Widget', code: 'W-1' }],
      })

    const stdout = await runCmd(ProductListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].name).toBe('Widget')
  })

  it('passes owner filter as owner_id query param', async () => {
    mockApi()
      .get('/api/v2/products')
      .query({ limit: '100', owner_id: '3' })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(ProductListCommand, [
      '--owner',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('renders the price column from the first price in table mode', async () => {
    mockApi()
      .get('/api/v2/products')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 7,
            name: 'Widget',
            code: 'W-1',
            unit: 'each',
            prices: [{ price: 9.99, currency: 'EUR' }],
          },
          { id: 8, name: 'Bare', code: 'B-1', unit: 'each' },
        ],
      })

    const stdout = await runCmd(ProductListCommand, ['--output', 'table'])

    expect(stdout).toContain('9.99 EUR')
    expect(stdout).toContain('Bare')
  })
})
