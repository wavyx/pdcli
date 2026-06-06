import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: OrgRelationshipListCommand } =
  await import('../../../../src/commands/org/relationship/list.js')
import { runCmd, mockApi } from '../../../helpers.js'

const REL = {
  id: 1,
  type: 'parent',
  related_organization_name: 'Telia',
  calculated_type: 'daughter',
  rel_owner_org_id: { name: 'Pipedrive Inc.', value: 1481 },
  rel_linked_org_id: { name: 'Telia', value: 1480 },
  add_time: '2020-09-22 08:58:28',
}

describe('org relationship list', () => {
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

  it('GETs relationships for the org and outputs JSON', async () => {
    const scope = mockApi()
      .get('/api/v1/organizationRelationships')
      .query({ org_id: '1481', limit: '500' })
      .reply(200, { success: true, data: [REL] })

    const stdout = await runCmd(OrgRelationshipListCommand, [
      '--org',
      '1481',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(stdout)[0].id).toBe(1)
  })

  it('paginates with the v1 offset pager', async () => {
    mockApi()
      .get('/api/v1/organizationRelationships')
      .query({ org_id: '1481', limit: '500' })
      .reply(200, {
        success: true,
        data: [REL],
        additional_data: {
          pagination: { more_items_in_collection: true, next_start: 1 },
        },
      })
      .get('/api/v1/organizationRelationships')
      .query({ org_id: '1481', limit: '500', start: '1' })
      .reply(200, {
        success: true,
        data: [{ ...REL, id: 2 }],
        additional_data: {
          pagination: { more_items_in_collection: false },
        },
      })

    const stdout = await runCmd(OrgRelationshipListCommand, [
      '--org',
      '1481',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toHaveLength(2)
  })

  it('renders a table with id, type and org names', async () => {
    mockApi()
      .get('/api/v1/organizationRelationships')
      .query({ org_id: '1481', limit: '500' })
      .reply(200, { success: true, data: [REL] })

    const stdout = await runCmd(OrgRelationshipListCommand, [
      '--org',
      '1481',
      '--output',
      'table',
    ])

    expect(stdout).toContain('parent')
    expect(stdout).toContain('Pipedrive Inc.')
    expect(stdout).toContain('Telia')
  })

  it('renders blank cells for missing org names in a table', async () => {
    mockApi()
      .get('/api/v1/organizationRelationships')
      .query({ org_id: '1481', limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 9, type: 'related' }],
      })

    const stdout = await runCmd(OrgRelationshipListCommand, [
      '--org',
      '1481',
      '--output',
      'table',
    ])

    expect(stdout).toContain('related')
    expect(stdout).toContain('9')
  })

  it('requires --org', async () => {
    await expect(OrgRelationshipListCommand.run([])).rejects.toThrow()
  })
})
