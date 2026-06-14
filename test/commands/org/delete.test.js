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

const { default: OrgDeleteCommand } =
  await import('../../../src/commands/org/delete.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('org delete', () => {
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
      .delete('/api/v2/organizations/7')
      .reply(200, { success: true, data: { id: 7 } })

    const stdout = await runCmd(OrgDeleteCommand, ['7'])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining('7'),
      false,
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Deleted')
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v2/organizations/7')
      .reply(200, { success: true, data: { id: 7 } })

    await runCmd(OrgDeleteCommand, ['7', '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(OrgDeleteCommand.run(['7'])).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('emits a JSON object with --output json', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .delete('/api/v2/organizations/7')
      .reply(200, { success: true, data: { id: 7 } })

    const stdout = await runCmd(OrgDeleteCommand, [
      '7',
      '--yes',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({ id: 7, deleted: true })
  })
})
