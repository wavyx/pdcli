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

const { default: LeadListCommand } =
  await import('../../../src/commands/lead/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('lead list', () => {
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

  it('lists leads', async () => {
    mockApi()
      .get('/api/v1/leads')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 'adf21080-0e10-11eb-879b-05d71fb426ec',
            title: 'Hot lead',
            value: { amount: 5000, currency: 'EUR' },
          },
        ],
      })

    const stdout = await runCmd(LeadListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].title).toBe('Hot lead')
  })

  it('passes owner, person, and org filters as query params', async () => {
    mockApi()
      .get('/api/v1/leads')
      .query({
        limit: '100',
        owner_id: '3',
        person_id: '4',
        organization_id: '5',
      })
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(LeadListCommand, [
      '--owner',
      '3',
      '--person',
      '4',
      '--org',
      '5',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('renders the value column in table mode', async () => {
    mockApi()
      .get('/api/v1/leads')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 'adf21080-0e10-11eb-879b-05d71fb426ec',
            title: 'Hot lead',
            value: { amount: 5000, currency: 'EUR' },
          },
          {
            id: 'bdf21080-0e10-11eb-879b-05d71fb426ec',
            title: 'No value',
          },
        ],
      })

    const stdout = await runCmd(LeadListCommand, ['--output', 'table'])

    expect(stdout).toContain('5000 EUR')
    expect(stdout).toContain('Hot lead')
    expect(stdout).toContain('No value')
  })
})
