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

const { default: PersonCreateCommand } =
  await import('../../../src/commands/person/create.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('person create', () => {
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

  it('POSTs typed flags as a v2 body and prints the created person', async () => {
    mockApi()
      .post('/api/v2/persons', {
        name: 'Jane Doe',
        org_id: 7,
        owner_id: 3,
        emails: [{ value: 'jane@acme.com', primary: true }],
        phones: [{ value: '+15551234', primary: true }],
      })
      .reply(201, {
        success: true,
        data: { id: 99, name: 'Jane Doe' },
      })

    const stdout = await runCmd(PersonCreateCommand, [
      '--name',
      'Jane Doe',
      '--org',
      '7',
      '--owner',
      '3',
      '--email',
      'jane@acme.com',
      '--phone',
      '+15551234',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(99)
  })

  it('marks only the first email and phone as primary', async () => {
    mockApi()
      .post('/api/v2/persons', {
        name: 'Multi',
        emails: [
          { value: 'a@acme.com', primary: true },
          { value: 'b@acme.com', primary: false },
        ],
        phones: [
          { value: '111', primary: true },
          { value: '222', primary: false },
        ],
      })
      .reply(201, {
        success: true,
        data: { id: 100, name: 'Multi' },
      })

    const stdout = await runCmd(PersonCreateCommand, [
      '--name',
      'Multi',
      '--email',
      'a@acme.com',
      '--email',
      'b@acme.com',
      '--phone',
      '111',
      '--phone',
      '222',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(100)
  })

  it('resolves --field custom fields into custom_fields', async () => {
    mockApi()
      .get('/api/v2/personFields')
      .reply(200, {
        success: true,
        data: [
          {
            id: 2,
            field_code: HASH,
            field_name: 'Segment',
            field_type: 'enum',
            is_custom_field: true,
            options: [
              { id: 10, label: 'SMB' },
              { id: 11, label: 'Enterprise' },
            ],
          },
        ],
      })
    mockApi()
      .post('/api/v2/persons', {
        name: 'Sized person',
        custom_fields: { [HASH]: 11 },
      })
      .reply(201, {
        success: true,
        data: { id: 101, name: 'Sized person' },
      })

    const stdout = await runCmd(PersonCreateCommand, [
      '--name',
      'Sized person',
      '--field',
      'Segment=Enterprise',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(101)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v2/persons', {
        name: 'Flag wins',
        visible_to: '3',
      })
      .reply(201, { success: true, data: { id: 102 } })

    const stdout = await runCmd(PersonCreateCommand, [
      '--name',
      'Flag wins',
      '--body',
      '{"name":"Body name","visible_to":"3"}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(102)
  })

  it('requires --name', async () => {
    await expect(PersonCreateCommand.run([])).rejects.toThrow()
  })
})
