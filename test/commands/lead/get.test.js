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

const { default: LeadGetCommand } =
  await import('../../../src/commands/lead/get.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const ID = 'adf21080-0e10-11eb-879b-05d71fb426ec'
const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('lead get', () => {
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

  it('prints raw JSON for a lead by UUID', async () => {
    mockApi()
      .get(`/api/v1/leads/${ID}`)
      .reply(200, {
        success: true,
        data: { id: ID, title: 'Hot lead' },
      })

    const stdout = await runCmd(LeadGetCommand, [ID, '--output', 'json'])
    const lead = JSON.parse(stdout)

    expect(lead.id).toBe(ID)
    expect(lead.title).toBe('Hot lead')
  })

  it('resolves shared deal custom fields in table mode', async () => {
    mockApi()
      .get(`/api/v1/leads/${ID}`)
      .reply(200, {
        success: true,
        data: {
          id: ID,
          title: 'Hot lead',
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

    const stdout = await runCmd(LeadGetCommand, [ID, '--output', 'table'])

    expect(stdout).toContain('Hot lead')
    expect(stdout).toContain('Deal Size')
    expect(stdout).toContain('Large')
  })
})
