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

const { default: OrgRelationshipAddCommand } =
  await import('../../../../src/commands/org/relationship/add.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('org relationship add', () => {
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

  it('POSTs the exact body and outputs the new relationship', async () => {
    const scope = mockApi()
      .post('/api/v1/organizationRelationships', {
        type: 'parent',
        rel_owner_org_id: 1481,
        rel_linked_org_id: 1480,
      })
      .reply(200, {
        success: true,
        data: { id: 7, type: 'parent' },
      })

    const stdout = await runCmd(OrgRelationshipAddCommand, [
      '--type',
      'parent',
      '--owner',
      '1481',
      '--linked',
      '1480',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(stdout).id).toBe(7)
  })

  it('accepts type related', async () => {
    const scope = mockApi()
      .post('/api/v1/organizationRelationships', {
        type: 'related',
        rel_owner_org_id: 1,
        rel_linked_org_id: 2,
      })
      .reply(200, { success: true, data: { id: 8, type: 'related' } })

    await runCmd(OrgRelationshipAddCommand, [
      '--type',
      'related',
      '--owner',
      '1',
      '--linked',
      '2',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('rejects an invalid --type', async () => {
    await expect(
      OrgRelationshipAddCommand.run([
        '--type',
        'sibling',
        '--owner',
        '1',
        '--linked',
        '2',
      ]),
    ).rejects.toThrow()
  })

  it('requires --type, --owner and --linked', async () => {
    await expect(
      OrgRelationshipAddCommand.run(['--owner', '1', '--linked', '2']),
    ).rejects.toThrow()
    await expect(
      OrgRelationshipAddCommand.run(['--type', 'parent', '--linked', '2']),
    ).rejects.toThrow()
    await expect(
      OrgRelationshipAddCommand.run(['--type', 'parent', '--owner', '1']),
    ).rejects.toThrow()
  })
})
