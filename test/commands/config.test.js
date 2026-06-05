import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetProfileConfig = vi.fn()
const mockSetProfileConfig = vi.fn()
const mockGetProfileData = vi.fn()
const mockDeleteProfileConfig = vi.fn()
vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  getProfileConfig: mockGetProfileConfig,
  setProfileConfig: mockSetProfileConfig,
  getProfileData: mockGetProfileData,
  deleteProfileConfig: mockDeleteProfileConfig,
}))

const { default: ConfigGetCommand } =
  await import('../../src/commands/config/get.js')
const { default: ConfigSetCommand } =
  await import('../../src/commands/config/set.js')
const { default: ConfigListCommand } =
  await import('../../src/commands/config/list.js')
const { default: ConfigUnsetCommand } =
  await import('../../src/commands/config/unset.js')
import { runCmd } from '../helpers.js'

describe('config get', () => {
  beforeEach(() => {
    mockGetProfileConfig.mockReset()
  })

  it('prints the value for a set key', async () => {
    mockGetProfileConfig.mockReturnValue('acme')

    const stdout = await runCmd(ConfigGetCommand, ['company_domain'])

    expect(mockGetProfileConfig).toHaveBeenCalledWith(
      'default',
      'company_domain',
    )
    expect(stdout).toContain('acme')
  })

  it('prints "not set" for an unset key', async () => {
    mockGetProfileConfig.mockReturnValue(undefined)

    const stdout = await runCmd(ConfigGetCommand, ['nope'])

    expect(stdout).toContain('not set')
  })
})

describe('config set', () => {
  beforeEach(() => {
    mockSetProfileConfig.mockReset()
  })

  it('stores the value for the active profile', async () => {
    const stdout = await runCmd(ConfigSetCommand, ['default_output', 'json'])

    expect(mockSetProfileConfig).toHaveBeenCalledWith(
      'default',
      'default_output',
      'json',
    )
    expect(stdout).toContain('default_output')
    expect(stdout).toContain('json')
  })

  it('rejects an invalid default_output value with exit 64', async () => {
    await expect(
      ConfigSetCommand.run(['default_output', 'xml']),
    ).rejects.toThrow(/table.*json.*yaml.*csv/)
    expect(mockSetProfileConfig).not.toHaveBeenCalled()
  })

  it('still accepts arbitrary values for unvalidated keys', async () => {
    await runCmd(ConfigSetCommand, ['company_domain', 'acme'])
    expect(mockSetProfileConfig).toHaveBeenCalledWith(
      'default',
      'company_domain',
      'acme',
    )
  })
})

describe('config unset', () => {
  beforeEach(() => {
    mockDeleteProfileConfig.mockReset()
    mockGetProfileConfig.mockReset()
  })

  it('removes a set key and confirms', async () => {
    mockGetProfileConfig.mockReturnValue('json')

    const stdout = await runCmd(ConfigUnsetCommand, ['default_output'])

    expect(mockDeleteProfileConfig).toHaveBeenCalledWith(
      'default',
      'default_output',
    )
    expect(stdout).toContain('default_output')
  })

  it('reports when the key was not set and does not delete', async () => {
    mockGetProfileConfig.mockReturnValue(undefined)

    const stdout = await runCmd(ConfigUnsetCommand, ['nope'])

    expect(mockDeleteProfileConfig).not.toHaveBeenCalled()
    expect(stdout).toContain('not set')
  })
})

describe('config list', () => {
  beforeEach(() => {
    mockGetProfileData.mockReset()
  })

  it('lists key=value pairs', async () => {
    mockGetProfileData.mockReturnValue({
      company_domain: 'acme',
      default_output: 'json',
    })

    const stdout = await runCmd(ConfigListCommand)

    expect(stdout).toContain('company_domain=acme')
    expect(stdout).toContain('default_output=json')
  })

  it('reports when no config is set', async () => {
    mockGetProfileData.mockReturnValue({})

    const stdout = await runCmd(ConfigListCommand)

    expect(stdout).toContain('No config set')
  })
})
