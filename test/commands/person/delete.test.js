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

const { default: PersonDeleteCommand } =
  await import('../../../src/commands/person/delete.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('person delete', () => {
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
      .delete('/api/v2/persons/42')
      .reply(200, { success: true, data: { id: 42 } })

    const stdout = await runCmd(PersonDeleteCommand, ['42'])

    expect(mockConfirmAction).toHaveBeenCalledWith(
      expect.stringContaining('42'),
      false,
    )
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('Deleted')
  })

  it('skips the prompt with --yes', async () => {
    mockConfirmAction.mockResolvedValue(true)
    const scope = mockApi()
      .delete('/api/v2/persons/42')
      .reply(200, { success: true, data: { id: 42 } })

    await runCmd(PersonDeleteCommand, ['42', '--yes'])

    expect(mockConfirmAction).toHaveBeenCalledWith(expect.any(String), true)
    expect(scope.isDone()).toBe(true)
  })

  it('aborts without deleting when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()

    try {
      await expect(PersonDeleteCommand.run(['42'])).rejects.toThrow(/abort/i)
    } finally {
      nock.enableNetConnect()
    }
  })
})
