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

const { default: OrgCreateCommand } =
  await import('../../../src/commands/org/create.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('org create', () => {
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

  it('POSTs typed flags as a v2 body and prints the created organization', async () => {
    mockApi()
      .post('/api/v2/organizations', {
        name: 'New Org',
        owner_id: 3,
      })
      .reply(201, {
        success: true,
        data: { id: 99, name: 'New Org', owner_id: 3 },
      })

    const stdout = await runCmd(OrgCreateCommand, [
      '--name',
      'New Org',
      '--owner',
      '3',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(99)
  })

  it('resolves --field custom fields into custom_fields', async () => {
    mockApi()
      .get('/api/v2/organizationFields')
      .reply(200, {
        success: true,
        data: [
          {
            id: 2,
            field_code: HASH,
            field_name: 'Tier',
            field_type: 'enum',
            is_custom_field: true,
            options: [
              { id: 10, label: 'Gold' },
              { id: 11, label: 'Silver' },
            ],
          },
        ],
      })
    mockApi()
      .post('/api/v2/organizations', {
        name: 'Tiered Org',
        custom_fields: { [HASH]: 11 },
      })
      .reply(201, {
        success: true,
        data: { id: 100, name: 'Tiered Org' },
      })

    const stdout = await runCmd(OrgCreateCommand, [
      '--name',
      'Tiered Org',
      '--field',
      'Tier=Silver',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(100)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v2/organizations', {
        name: 'Flag wins',
        visible_to: 3,
      })
      .reply(201, { success: true, data: { id: 101 } })

    const stdout = await runCmd(OrgCreateCommand, [
      '--name',
      'Flag wins',
      '--body',
      '{"name":"Body name","visible_to":3}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(101)
  })

  it('requires --name', async () => {
    await expect(OrgCreateCommand.run([])).rejects.toThrow()
  })
})
