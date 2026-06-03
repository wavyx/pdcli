import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetProfileConfig = vi.fn()
vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  getProfileConfig: mockGetProfileConfig,
}))

const { default: VersionCommand } =
  await import('../../src/commands/version.js')
import { runCmd } from '../helpers.js'

describe('version', () => {
  beforeEach(() => {
    mockGetProfileConfig.mockReset()
  })

  it('prints version, node, company domain, and platform', async () => {
    mockGetProfileConfig.mockReturnValue('acme')

    const stdout = await runCmd(VersionCommand)

    expect(stdout).toContain('pdcli')
    expect(stdout).toMatch(/\d+\.\d+\.\d+/)
    expect(stdout).toContain(process.version)
    expect(stdout).toContain('acme.pipedrive.com')
    expect(stdout).toContain(process.platform)
  })

  it('shows (not set) when no company domain is configured', async () => {
    mockGetProfileConfig.mockReturnValue(undefined)

    const stdout = await runCmd(VersionCommand)

    expect(stdout).toContain('(not set)')
  })
})
