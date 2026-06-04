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

const mockConfirmAction = vi.fn()
vi.mock('../../../src/lib/confirm.js', () => ({
  confirmAction: mockConfirmAction,
}))

const mockReadFileSync = vi.fn()
vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}))

const { default: OrgImportCommand } =
  await import('../../../src/commands/org/import.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('org import', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockConfirmAction.mockReset()
    mockConfirmAction.mockResolvedValue(true)
    mockReadFileSync.mockReset()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('creates an organization per CSV row', async () => {
    mockReadFileSync.mockReturnValue('name\nAcme\nGlobex\n')
    mockApi()
      .post('/api/v2/organizations', { name: 'Acme' })
      .reply(201, { success: true, data: { id: 1 } })
    mockApi()
      .post('/api/v2/organizations', { name: 'Globex' })
      .reply(201, { success: true, data: { id: 2 } })

    const stdout = await runCmd(OrgImportCommand, ['orgs.csv', '--yes'])

    expect(stdout).toContain('2/2')
  })

  it('--dry-run validates without creating', async () => {
    mockReadFileSync.mockReturnValue('name\nAcme\n')
    nock.disableNetConnect()
    try {
      const stdout = await runCmd(OrgImportCommand, ['orgs.csv', '--dry-run'])
      expect(stdout).toContain('1 rows valid')
    } finally {
      nock.enableNetConnect()
    }
  })
})

describe('org import edge paths', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockConfirmAction.mockReset()
    mockConfirmAction.mockResolvedValue(true)
    mockReadFileSync.mockReset()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('maps owner_id and requires name column', async () => {
    mockReadFileSync.mockReturnValue('name,owner_id\nAcme,42\n')
    mockApi()
      .post('/api/v2/organizations', { name: 'Acme', owner_id: 42 })
      .reply(201, { success: true, data: { id: 5 } })

    const stdout = await runCmd(OrgImportCommand, ['o.csv', '--yes'])
    expect(stdout).toContain('1/1')
  })

  it('rejects a CSV without a name column', async () => {
    mockReadFileSync.mockReturnValue('owner_id\n42\n')
    await expect(OrgImportCommand.run(['o.csv', '--yes'])).rejects.toThrow(
      /name/i,
    )
  })

  it('aborts when the confirmation is declined', async () => {
    mockReadFileSync.mockReturnValue('name\nAcme\n')
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()
    try {
      await expect(OrgImportCommand.run(['o.csv'])).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('reports per-row failures and exits 1', async () => {
    mockReadFileSync.mockReturnValue('name\nAcme\nGlobex\n')
    mockApi()
      .post('/api/v2/organizations', { name: 'Acme' })
      .reply(201, { success: true, data: { id: 1 } })
    mockApi()
      .post('/api/v2/organizations', { name: 'Globex' })
      .reply(400, { success: false, error: 'duplicate org' })

    await expect(OrgImportCommand.run(['o.csv', '--yes'])).rejects.toThrow(
      /1 of 2/i,
    )
  })

  it('uses field defs for non-special headers', async () => {
    mockReadFileSync.mockReturnValue('name,Tier\nAcme,Gold\n')
    const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'
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
            options: [{ id: 10, label: 'Gold' }],
          },
        ],
      })
    mockApi()
      .post('/api/v2/organizations', {
        name: 'Acme',
        custom_fields: { [HASH]: 10 },
      })
      .reply(201, { success: true, data: { id: 9 } })

    const stdout = await runCmd(OrgImportCommand, ['o.csv', '--yes'])
    expect(stdout).toContain('1/1')
  })
})

describe('org import unnamed failures', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockConfirmAction.mockReset()
    mockConfirmAction.mockResolvedValue(true)
    mockReadFileSync.mockReset()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('labels failed rows without a name as (unnamed)', async () => {
    mockReadFileSync.mockReturnValue('name,owner_id\n,42\n')
    mockApi()
      .post('/api/v2/organizations', { owner_id: 42 })
      .reply(400, { success: false, error: 'name required' })

    await expect(OrgImportCommand.run(['o.csv', '--yes'])).rejects.toThrow(
      /1 of 1/i,
    )
  })
})
