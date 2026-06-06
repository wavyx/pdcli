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

const mockConfirmAction = vi.fn()
vi.mock('../../../../src/lib/confirm.js', () => ({
  confirmAction: mockConfirmAction,
}))

const { default: OrgRelationshipRemoveCommand } =
  await import('../../../../src/commands/org/relationship/remove.js')
import { runCmd, mockApi } from '../../../helpers.js'

describe('org relationship remove', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockConfirmAction.mockReset()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('deletes after confirmation', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v1/organizationRelationships/7')
      .reply(200, { success: true, data: { id: 7 } })

    const stdout = await runCmd(OrgRelationshipRemoveCommand, ['7'])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining('7'),
      false,
      { default: false },
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Deleted')
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v1/organizationRelationships/7')
      .reply(200, { success: true, data: { id: 7 } })

    await runCmd(OrgRelationshipRemoveCommand, ['7', '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true, {
      default: false,
    })
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(OrgRelationshipRemoveCommand.run(['7'])).rejects.toThrow(
        /abort/i,
      )
    } finally {
      nock.enableNetConnect()
    }
  })

  it('requires the relationship id positional', async () => {
    await expect(OrgRelationshipRemoveCommand.run([])).rejects.toThrow()
  })
})
