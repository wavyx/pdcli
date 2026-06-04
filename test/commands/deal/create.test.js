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

const { default: DealCreateCommand } =
  await import('../../../src/commands/deal/create.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('deal create', () => {
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

  it('POSTs typed flags as a v2 body and prints the created deal', async () => {
    mockApi()
      .post('/api/v2/deals', {
        title: 'New deal',
        value: 5000,
        currency: 'EUR',
        stage_id: 3,
      })
      .reply(201, {
        success: true,
        data: { id: 99, title: 'New deal', value: 5000 },
      })

    const stdout = await runCmd(DealCreateCommand, [
      '--title',
      'New deal',
      '--value',
      '5000',
      '--currency',
      'EUR',
      '--stage',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(99)
  })

  it('resolves --field custom fields into custom_fields', async () => {
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
            is_custom_field: true,
            options: [
              { id: 10, label: 'Small' },
              { id: 11, label: 'Large' },
            ],
          },
        ],
      })
    mockApi()
      .post('/api/v2/deals', {
        title: 'Sized deal',
        custom_fields: { [HASH]: 11 },
      })
      .reply(201, {
        success: true,
        data: { id: 100, title: 'Sized deal' },
      })

    const stdout = await runCmd(DealCreateCommand, [
      '--title',
      'Sized deal',
      '--field',
      'Deal Size=Large',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(100)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v2/deals', {
        title: 'Flag wins',
        probability: 75,
      })
      .reply(201, { success: true, data: { id: 101 } })

    const stdout = await runCmd(DealCreateCommand, [
      '--title',
      'Flag wins',
      '--body',
      '{"title":"Body title","probability":75}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(101)
  })

  it('requires --title', async () => {
    await expect(DealCreateCommand.run([])).rejects.toThrow()
  })
})
