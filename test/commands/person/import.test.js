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

const { default: PersonImportCommand } =
  await import('../../../src/commands/person/import.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('person import', () => {
  beforeEach(() => {
    nock.cleanAll()
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

  it('creates a person per CSV row', async () => {
    mockReadFileSync.mockReturnValue('name,email\nJane,j@a.com\nBob,b@a.com\n')
    mockApi()
      .post('/api/v2/persons', {
        name: 'Jane',
        emails: [{ value: 'j@a.com', primary: true }],
      })
      .reply(201, { success: true, data: { id: 1 } })
    mockApi()
      .post('/api/v2/persons', {
        name: 'Bob',
        emails: [{ value: 'b@a.com', primary: true }],
      })
      .reply(201, { success: true, data: { id: 2 } })

    const stdout = await runCmd(PersonImportCommand, ['people.csv', '--yes'])

    expect(mockReadFileSync).toHaveBeenCalledWith('people.csv', 'utf8')
    expect(stdout).toContain('2/2')
  })

  it('--dry-run validates rows without creating anything', async () => {
    mockReadFileSync.mockReturnValue('name\nJane\nBob\n')
    nock.disableNetConnect()
    try {
      const stdout = await runCmd(PersonImportCommand, [
        'people.csv',
        '--dry-run',
      ])
      expect(stdout).toContain('2 rows valid')
    } finally {
      nock.enableNetConnect()
    }
  })

  it('requires a name column upfront', async () => {
    mockReadFileSync.mockReturnValue('email\nj@a.com\n')
    await expect(
      PersonImportCommand.run(['people.csv', '--yes']),
    ).rejects.toThrow(/name/i)
  })

  it('reports per-row failures and exits 1', async () => {
    mockReadFileSync.mockReturnValue('name\nJane\nBob\n')
    mockApi()
      .post('/api/v2/persons', { name: 'Jane' })
      .reply(201, { success: true, data: { id: 1 } })
    mockApi()
      .post('/api/v2/persons', { name: 'Bob' })
      .reply(400, { success: false, error: 'duplicate' })

    await expect(
      PersonImportCommand.run(['people.csv', '--yes']),
    ).rejects.toThrow(/1 of 2/i)
  })

  it('asks for confirmation with the row count', async () => {
    mockReadFileSync.mockReturnValue('name\nJane\n')
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()
    try {
      await expect(PersonImportCommand.run(['people.csv'])).rejects.toThrow(
        /abort/i,
      )
      expect(mockConfirmAction).toHaveBeenCalledWith(
        expect.stringContaining('1 persons'),
        false,
      )
    } finally {
      nock.enableNetConnect()
    }
  })
})

describe('person import special columns', () => {
  beforeEach(() => {
    nock.cleanAll()
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

  it('maps phone, org_id, and owner_id columns', async () => {
    mockReadFileSync.mockReturnValue(
      'name,phone,org_id,owner_id\nJane,+322555,7,42\n',
    )
    mockApi()
      .post('/api/v2/persons', {
        name: 'Jane',
        phones: [{ value: '+322555', primary: true }],
        org_id: 7,
        owner_id: 42,
      })
      .reply(201, { success: true, data: { id: 3 } })

    const stdout = await runCmd(PersonImportCommand, ['p.csv', '--yes'])
    expect(stdout).toContain('1/1')
  })
})

describe('person import custom-field headers and unnamed failures', () => {
  beforeEach(() => {
    nock.cleanAll()
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

  it('resolves custom-field headers via personFields', async () => {
    const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'
    const { clearFieldsCache } = await import('../../../src/lib/fields.js')
    clearFieldsCache()
    mockReadFileSync.mockReturnValue('name,Segment\nJane,SMB\n')
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
            options: [{ id: 10, label: 'SMB' }],
          },
        ],
      })
    mockApi()
      .post('/api/v2/persons', {
        name: 'Jane',
        custom_fields: { [HASH]: 10 },
      })
      .reply(201, { success: true, data: { id: 4 } })

    const stdout = await runCmd(PersonImportCommand, ['p.csv', '--yes'])
    expect(stdout).toContain('1/1')
  })

  it('labels failed rows without a name as (unnamed)', async () => {
    mockReadFileSync.mockReturnValue('name,email\n,x@a.com\n')
    mockApi()
      .post('/api/v2/persons', {
        emails: [{ value: 'x@a.com', primary: true }],
      })
      .reply(400, { success: false, error: 'name required' })

    await expect(PersonImportCommand.run(['p.csv', '--yes'])).rejects.toThrow(
      /1 of 1/i,
    )
  })
})
