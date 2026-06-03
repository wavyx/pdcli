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

const { default: DealGetCommand } =
  await import('../../../src/commands/deal/get.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('deal get', () => {
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
      .get('/api/v2/deals/42')
      .reply(200, {
        success: true,
        data: {
          id: 42,
          title: 'Answer deal',
          custom_fields: { [HASH]: 11 },
        },
      })

    const stdout = await runCmd(DealGetCommand, ['42', '--output', 'json'])
    const deal = JSON.parse(stdout)

    expect(deal.id).toBe(42)
    // JSON stays raw — hash keys preserved for scripting
    expect(deal.custom_fields[HASH]).toBe(11)
  })

  it('resolves custom-field names and option labels in table mode', async () => {
    mockApi()
      .get('/api/v2/deals/42')
      .reply(200, {
        success: true,
        data: {
          id: 42,
          title: 'Answer deal',
          custom_fields: { [HASH]: 11 },
        },
      })
    mockApi()
      .get('/api/v2/dealFields')
      .reply(200, {
        success: true,
        data: [
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

    const stdout = await runCmd(DealGetCommand, ['42', '--output', 'table'])

    expect(stdout).toContain('Answer deal')
    expect(stdout).toContain('Deal Size')
    expect(stdout).toContain('Large')
  })

  it('requires an integer id argument', async () => {
    await expect(DealGetCommand.run(['not-a-number'])).rejects.toThrow()
  })
})
