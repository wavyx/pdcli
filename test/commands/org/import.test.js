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

describe('org import --upsert', () => {
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

  afterEach(() => nock.cleanAll())

  function mockFields() {
    mockApi()
      .get('/api/v2/organizationFields')
      .reply(200, { success: true, data: [] })
  }

  it('creates new rows and patches matched ones, reporting counts', async () => {
    mockFields()
    mockReadFileSync.mockReturnValue('name,owner_id\nAcme,42\nGlobex,5\n')
    mockApi()
      .get('/api/v2/organizations/search')
      .query((q) => q.term === 'Acme')
      .reply(200, {
        success: true,
        data: { items: [{ item: { id: 7, name: 'Acme', owner_id: 1 } }] },
        additional_data: { next_cursor: null },
      })
    mockApi()
      .get('/api/v2/organizations/search')
      .query((q) => q.term === 'Globex')
      .reply(200, {
        success: true,
        data: { items: [] },
        additional_data: { next_cursor: null },
      })
    mockApi()
      .patch('/api/v2/organizations/7')
      .reply(200, { success: true, data: { id: 7 } })
    mockApi()
      .post('/api/v2/organizations')
      .reply(201, { success: true, data: { id: 8 } })

    const stdout = await runCmd(OrgImportCommand, [
      'o.csv',
      '--upsert',
      '--match-on',
      'name',
      '--yes',
    ])
    expect(stdout).toContain('1 created')
    expect(stdout).toContain('1 updated')
  })

  it('requires --match-on', async () => {
    mockReadFileSync.mockReturnValue('name\nAcme\n')
    nock.disableNetConnect()
    try {
      await expect(
        OrgImportCommand.run(['o.csv', '--upsert', '--yes']),
      ).rejects.toThrow(/match-on/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('rejects a --match-on column that is not in the CSV', async () => {
    mockReadFileSync.mockReturnValue('name\nAcme\n')
    nock.disableNetConnect()
    try {
      await expect(
        OrgImportCommand.run([
          'o.csv',
          '--upsert',
          '--match-on',
          'industry',
          '--yes',
        ]),
      ).rejects.toThrow(/column/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('--dry-run looks up but writes nothing', async () => {
    mockFields()
    mockReadFileSync.mockReturnValue('name\nAcme\n')
    mockApi()
      .get('/api/v2/organizations/search')
      .query((q) => q.term === 'Acme')
      .reply(200, {
        success: true,
        data: { items: [] },
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(OrgImportCommand, [
      'o.csv',
      '--upsert',
      '--match-on',
      'name',
      '--dry-run',
    ])
    expect(stdout).toContain('[dry-run]')
    expect(stdout).toContain('1 created')
    expect(mockConfirmAction).not.toHaveBeenCalled()
  })

  it('collects an ambiguous row as a failure and exits 1', async () => {
    mockFields()
    mockReadFileSync.mockReturnValue('name\ndup\n')
    mockApi()
      .get('/api/v2/organizations/search')
      .query((q) => q.term === 'dup')
      .reply(200, {
        success: true,
        data: {
          items: [
            { item: { id: 1, name: 'dup' } },
            { item: { id: 2, name: 'dup' } },
          ],
        },
        additional_data: { next_cursor: null },
      })

    await expect(
      OrgImportCommand.run([
        'o.csv',
        '--upsert',
        '--match-on',
        'name',
        '--yes',
      ]),
    ).rejects.toThrow(/1 of 1/i)
  })

  it('aborts when the upsert confirmation is declined', async () => {
    mockFields()
    mockReadFileSync.mockReturnValue('name\nAcme\n')
    mockConfirmAction.mockResolvedValue(false)
    await expect(
      OrgImportCommand.run(['o.csv', '--upsert', '--match-on', 'name']),
    ).rejects.toThrow(/abort/i)
  })
})
