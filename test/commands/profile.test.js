import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAllProfiles = vi.fn()
const mockGetActiveProfile = vi.fn()
const mockSetActiveProfile = vi.fn()
vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  getAllProfiles: mockGetAllProfiles,
  getActiveProfile: mockGetActiveProfile,
  setActiveProfile: mockSetActiveProfile,
}))

const mockGetToken = vi.fn()
vi.mock('../../src/lib/keychain.js', () => ({
  getToken: mockGetToken,
}))

const { default: ProfileListCommand } =
  await import('../../src/commands/profile/list.js')
const { default: ProfileUseCommand } =
  await import('../../src/commands/profile/use.js')
const { default: ProfileCurrentCommand } =
  await import('../../src/commands/profile/current.js')
import { runCmd } from '../helpers.js'

describe('profile list', () => {
  beforeEach(() => {
    mockGetAllProfiles.mockReset()
    mockGetActiveProfile.mockReset()
    mockGetToken.mockReset()
  })

  it('marks the active profile and shows auth state', async () => {
    mockGetAllProfiles.mockReturnValue({ default: {}, work: {} })
    mockGetActiveProfile.mockReturnValue('default')
    mockGetToken.mockImplementation(async (profile) =>
      profile === 'default' ? 'tok' : null,
    )

    const stdout = await runCmd(ProfileListCommand)

    expect(stdout).toContain('* default')
    expect(stdout).toContain('(authenticated)')
    expect(stdout).toContain('work')
  })

  it('suggests auth login when no profiles exist', async () => {
    mockGetAllProfiles.mockReturnValue({})
    mockGetActiveProfile.mockReturnValue('default')
    mockGetToken.mockResolvedValue(null)

    const stdout = await runCmd(ProfileListCommand)

    expect(stdout).toContain('pdcli auth login')
  })
})

describe('profile use', () => {
  it('switches the active profile', async () => {
    const stdout = await runCmd(ProfileUseCommand, ['work'])

    expect(mockSetActiveProfile).toHaveBeenCalledWith('work')
    expect(stdout).toContain('work')
  })
})

describe('profile current', () => {
  it('prints the active profile', async () => {
    mockGetActiveProfile.mockReturnValue('staging')

    const stdout = await runCmd(ProfileCurrentCommand)

    expect(stdout).toContain('staging')
  })
})
