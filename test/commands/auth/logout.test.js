import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDeleteToken = vi.fn()
const mockDeleteOAuthTokens = vi.fn()
vi.mock('../../../src/lib/keychain.js', () => ({
  deleteToken: mockDeleteToken,
  deleteOAuthTokens: mockDeleteOAuthTokens,
}))

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: LogoutCommand } =
  await import('../../../src/commands/auth/logout.js')
import { runCmd } from '../../helpers.js'

describe('auth logout', () => {
  beforeEach(() => {
    mockDeleteToken.mockReset()
  })

  it('deletes the stored token for the active profile', async () => {
    const stdout = await runCmd(LogoutCommand)

    expect(mockDeleteToken).toHaveBeenCalledWith('default')
    expect(stdout).toContain('Logged out')
    expect(stdout).toContain('default')
  })
})

describe('auth logout clears OAuth tokens too', () => {
  it('deletes both keychain slots', async () => {
    await runCmd(LogoutCommand)
    expect(mockDeleteOAuthTokens).toHaveBeenCalledWith('default')
  })
})
