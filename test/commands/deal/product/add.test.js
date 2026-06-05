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

const { default: DealProductAddCommand } =
  await import('../../../../src/commands/deal/product/add.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('deal product add', () => {
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

  it('POSTs product_id, item_price and a default quantity of 1', async () => {
    mockApi()
      .post('/api/v2/deals/42/products', {
        product_id: 10,
        item_price: 90,
        quantity: 1,
      })
      .reply(201, {
        success: true,
        data: { id: 3, product_id: 10, item_price: 90, quantity: 1 },
      })

    const stdout = await runCmd(DealProductAddCommand, [
      '42',
      '--product',
      '10',
      '--price',
      '90',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(3)
  })

  it('passes optional discount, discount-type, tax and comments', async () => {
    mockApi()
      .post('/api/v2/deals/42/products', {
        product_id: 10,
        item_price: 90,
        quantity: 3,
        discount: 10,
        discount_type: 'percentage',
        tax: 20,
        comments: 'bulk order',
      })
      .reply(201, { success: true, data: { id: 4 } })

    const stdout = await runCmd(DealProductAddCommand, [
      '42',
      '--product',
      '10',
      '--price',
      '90',
      '--quantity',
      '3',
      '--discount',
      '10',
      '--discount-type',
      'percentage',
      '--tax',
      '20',
      '--comments',
      'bulk order',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(4)
  })

  it('requires --product', async () => {
    await expect(
      DealProductAddCommand.run(['42', '--price', '90']),
    ).rejects.toThrow()
  })

  it('requires --price', async () => {
    await expect(
      DealProductAddCommand.run(['42', '--product', '10']),
    ).rejects.toThrow()
  })

  it('requires the deal id positional', async () => {
    await expect(
      DealProductAddCommand.run(['--product', '10', '--price', '90']),
    ).rejects.toThrow()
  })
})
