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

const { default: DealProductListCommand } =
  await import('../../../../src/commands/deal/product/list.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('deal product list', () => {
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

  it('lists deal products across cursor pages as JSON', async () => {
    mockApi()
      .get('/api/v2/deals/42/products')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          { id: 1, product_id: 10, name: 'Pencil', item_price: 5, quantity: 2 },
          { id: 2, product_id: 11, name: 'Pen', item_price: 3, quantity: 1 },
        ],
        additional_data: { next_cursor: 'abc' },
      })
      .get('/api/v2/deals/42/products')
      .query({ limit: '500', cursor: 'abc' })
      .reply(200, {
        success: true,
        data: [
          { id: 3, product_id: 12, name: 'Eraser', item_price: 1, quantity: 4 },
        ],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(DealProductListCommand, [
      '42',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(3)
    expect(rows[2].name).toBe('Eraser')
  })

  it('caps results with --limit', async () => {
    mockApi()
      .get('/api/v2/deals/42/products')
      .query({ limit: '1' })
      .reply(200, {
        success: true,
        data: [{ id: 1, product_id: 10, name: 'Pencil' }],
        additional_data: { next_cursor: 'more' },
      })

    const stdout = await runCmd(DealProductListCommand, [
      '42',
      '--limit',
      '1',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toHaveLength(1)
  })

  it('passes sort_by and sort_direction as query params', async () => {
    mockApi()
      .get('/api/v2/deals/42/products')
      .query({ limit: '500', sort_by: 'add_time', sort_direction: 'desc' })
      .reply(200, {
        success: true,
        data: [{ id: 9, product_id: 10, name: 'Latest' }],
      })

    const stdout = await runCmd(DealProductListCommand, [
      '42',
      '--sort-by',
      'add_time',
      '--sort-direction',
      'desc',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].id).toBe(9)
  })

  it('renders a table with the deal-product columns', async () => {
    mockApi()
      .get('/api/v2/deals/42/products')
      .query({ limit: '500' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 3,
            product_id: 10,
            name: 'Mechanical Pencil',
            item_price: 90,
            quantity: 1,
            discount: 0,
            sum: 90,
          },
        ],
      })

    const stdout = await runCmd(DealProductListCommand, [
      '42',
      '--output',
      'table',
    ])

    expect(stdout).toContain('Mechanical Pencil')
    expect(stdout).toContain('90')
  })

  it('requires the deal id positional', async () => {
    await expect(DealProductListCommand.run([])).rejects.toThrow()
  })
})
