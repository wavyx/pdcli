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

const { default: PersonListCommand } =
  await import('../../../src/commands/person/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('person list', () => {
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

  it('lists persons with primary email/phone in table mode', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 1,
            name: 'Jane Doe',
            emails: [{ value: 'jane@acme.com', primary: true }],
            phones: [{ value: '+3225550100', primary: true }],
            org_id: 7,
          },
        ],
      })

    const stdout = await runCmd(PersonListCommand, ['--output', 'table'])

    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('jane@acme.com')
    expect(stdout).toContain('+3225550100')
  })

  it('passes org filter as org_id query param', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '100', org_id: '7' })
      .reply(200, { success: true, data: [{ id: 2, name: 'Org person' }] })

    const stdout = await runCmd(PersonListCommand, [
      '--org',
      '7',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)[0].id).toBe(2)
  })
})

describe('person list edge cases', () => {
  it('renders blanks for persons without emails or phones', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 3, name: 'No Contact', emails: [], phones: null }],
      })

    const stdout = await runCmd(PersonListCommand, ['--output', 'table'])

    expect(stdout).toContain('No Contact')
  })

  it('falls back to the first email when none is primary', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [
          {
            id: 4,
            name: 'Secondary',
            emails: [{ value: 'first@acme.com', primary: false }],
          },
        ],
      })

    const stdout = await runCmd(PersonListCommand, ['--output', 'table'])

    expect(stdout).toContain('first@acme.com')
  })
})

describe('person list email entry without value', () => {
  it('renders an empty cell', async () => {
    mockApi()
      .get('/api/v2/persons')
      .query({ limit: '100' })
      .reply(200, {
        success: true,
        data: [{ id: 5, name: 'Valueless', emails: [{ primary: true }] }],
      })

    const stdout = await runCmd(PersonListCommand, ['--output', 'table'])

    expect(stdout).toContain('Valueless')
  })
})
