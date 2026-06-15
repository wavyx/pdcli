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

const { default: LeadDeleteCommand } =
  await import('../../../src/commands/lead/delete.js')
import { runCmd, mockApi } from '../../helpers.js'

const ID = 'adf21080-0e10-11eb-879b-05d71fb426ec'

describe('lead delete', () => {
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
      .delete(`/api/v1/leads/${ID}`)
      .reply(200, { success: true, data: { id: ID } })

    const stdout = await runCmd(LeadDeleteCommand, [ID])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining(ID),
      false,
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Deleted')
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete(`/api/v1/leads/${ID}`)
      .reply(200, { success: true, data: { id: ID } })

    await runCmd(LeadDeleteCommand, [ID, '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(LeadDeleteCommand.run([ID])).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('emits a JSON object with --output json', async () => {
    mockConfirmAction.mockResolvedValue(true)
    mockApi()
      .delete(`/api/v1/leads/${ID}`)
      .reply(200, { success: true, data: { id: ID } })

    const stdout = await runCmd(LeadDeleteCommand, [
      ID,
      '--yes',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({ id: ID, deleted: true })
  })
})
