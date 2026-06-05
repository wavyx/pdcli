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

const { default: DealProductUpdateCommand } =
  await import('../../../../src/commands/deal/product/update.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('deal product update', () => {
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

  it('PATCHes only the provided flags at the attachment id', async () => {
    mockApi()
      .patch('/api/v2/deals/42/products/3', { quantity: 5 })
      .reply(200, {
        success: true,
        data: { id: 3, quantity: 5 },
      })

    const stdout = await runCmd(DealProductUpdateCommand, [
      '42',
      '--attachment',
      '3',
      '--quantity',
      '5',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).quantity).toBe(5)
  })

  it('PATCHes price, discount and discount-type together', async () => {
    mockApi()
      .patch('/api/v2/deals/42/products/3', {
        item_price: 120,
        discount: 15,
        discount_type: 'amount',
      })
      .reply(200, { success: true, data: { id: 3, item_price: 120 } })

    const stdout = await runCmd(DealProductUpdateCommand, [
      '42',
      '--attachment',
      '3',
      '--price',
      '120',
      '--discount',
      '15',
      '--discount-type',
      'amount',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).item_price).toBe(120)
  })

  it('PATCHes product_id, tax and comments', async () => {
    mockApi()
      .patch('/api/v2/deals/42/products/3', {
        product_id: 11,
        tax: 20,
        comments: 'swapped product',
      })
      .reply(200, { success: true, data: { id: 3, product_id: 11 } })

    const stdout = await runCmd(DealProductUpdateCommand, [
      '42',
      '--attachment',
      '3',
      '--product',
      '11',
      '--tax',
      '20',
      '--comments',
      'swapped product',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).product_id).toBe(11)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(
      DealProductUpdateCommand.run(['42', '--attachment', '3']),
    ).rejects.toThrow(/nothing to update/i)
  })

  it('requires --attachment', async () => {
    await expect(
      DealProductUpdateCommand.run(['42', '--quantity', '5']),
    ).rejects.toThrow()
  })

  it('requires the deal id positional', async () => {
    await expect(
      DealProductUpdateCommand.run(['--attachment', '3', '--quantity', '5']),
    ).rejects.toThrow()
  })

  it('rejects non-numeric --quantity with a clean input error (exit 64)', async () => {
    const err = await DealProductUpdateCommand.run([
      '1',
      '--attachment',
      '3',
      '--quantity',
      'xyz',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })
})
