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

const { default: LeadCreateCommand } =
  await import('../../../src/commands/lead/create.js')
import { runCmd, mockApi } from '../../helpers.js'

const ID = 'adf21080-0e10-11eb-879b-05d71fb426ec'

describe('lead create', () => {
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

  it('POSTs typed flags as a v1 body and prints the created lead', async () => {
    mockApi()
      .post('/api/v1/leads', {
        title: 'New lead',
        person_id: 4,
        organization_id: 5,
        owner_id: 3,
        value: { amount: 5000, currency: 'EUR' },
        expected_close_date: '2026-12-31',
      })
      .reply(201, {
        success: true,
        data: { id: ID, title: 'New lead' },
      })

    const stdout = await runCmd(LeadCreateCommand, [
      '--title',
      'New lead',
      '--person',
      '4',
      '--org',
      '5',
      '--owner',
      '3',
      '--value',
      '5000',
      '--currency',
      'EUR',
      '--expected-close-date',
      '2026-12-31',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(ID)
  })

  it('omits value when neither value nor currency is given', async () => {
    mockApi()
      .post('/api/v1/leads', { title: 'Plain lead' })
      .reply(201, { success: true, data: { id: ID, title: 'Plain lead' } })

    const stdout = await runCmd(LeadCreateCommand, [
      '--title',
      'Plain lead',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(ID)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v1/leads', {
        title: 'Flag wins',
        visible_to: '3',
      })
      .reply(201, { success: true, data: { id: ID } })

    const stdout = await runCmd(LeadCreateCommand, [
      '--title',
      'Flag wins',
      '--body',
      '{"title":"Body title","visible_to":"3"}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(ID)
  })

  it('requires --title', async () => {
    await expect(LeadCreateCommand.run([])).rejects.toThrow()
  })

  it('requires --currency when --value is given', async () => {
    await expect(
      LeadCreateCommand.run(['--title', 'Bad', '--value', '5000']),
    ).rejects.toThrow()
  })
})
