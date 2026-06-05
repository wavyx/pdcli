import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Config } from '@oclif/core'

const mockSetAlias = vi.fn()
const mockGetAlias = vi.fn()
const mockUnsetAlias = vi.fn()
const mockGetAliases = vi.fn()

vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

vi.mock('../../src/lib/aliases.js', () => ({
  setAlias: mockSetAlias,
  getAlias: mockGetAlias,
  unsetAlias: mockUnsetAlias,
  getAliases: mockGetAliases,
}))

const { default: AliasSetCommand } =
  await import('../../src/commands/alias/set.js')
const { default: AliasListCommand } =
  await import('../../src/commands/alias/list.js')
const { default: AliasUnsetCommand } =
  await import('../../src/commands/alias/unset.js')
import { runCmd } from '../helpers.js'

describe('alias set', () => {
  beforeEach(() => {
    mockSetAlias.mockReset()
    mockGetAlias.mockReset()
    mockUnsetAlias.mockReset()
    mockGetAliases.mockReset()
  })

  it('calls setAlias with name and command', async () => {
    await runCmd(AliasSetCommand, ['wd', 'deal list --status won'])

    expect(mockSetAlias).toHaveBeenCalledWith('wd', 'deal list --status won')
  })

  it('logs confirmation message with alias name and command', async () => {
    const stdout = await runCmd(AliasSetCommand, [
      'wd',
      'deal list --status won',
    ])

    expect(stdout).toContain('wd')
    expect(stdout).toContain('deal list --status won')
  })

  it('refuses to shadow an existing command with exit 64', async () => {
    const config = await Config.load(process.cwd())
    let thrown
    try {
      await AliasSetCommand.run(['version', 'version'], config)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeDefined()
    expect(thrown.message).toMatch(/existing/i)
    expect(thrown.exitCode ?? thrown.oclif?.exit).toBe(64)
    expect(mockSetAlias).not.toHaveBeenCalled()
  })
})

describe('alias list', () => {
  beforeEach(() => {
    mockSetAlias.mockReset()
    mockGetAlias.mockReset()
    mockUnsetAlias.mockReset()
    mockGetAliases.mockReset()
  })

  it('shows message when no aliases configured', async () => {
    mockGetAliases.mockReturnValue({})

    const stdout = await runCmd(AliasListCommand)

    expect(stdout).toContain('No aliases configured')
  })

  it('renders aliases in table format', async () => {
    mockGetAliases.mockReturnValue({
      wd: 'deal list --status won',
      open: 'deal list --status open',
    })

    const stdout = await runCmd(AliasListCommand, ['--output', 'table'])

    expect(stdout).toContain('wd')
    expect(stdout).toContain('deal list --status won')
    expect(stdout).toContain('open')
    expect(stdout).toContain('deal list --status open')
  })

  it('renders aliases as JSON when --output json', async () => {
    mockGetAliases.mockReturnValue({
      wd: 'deal list',
      open: 'deal list --status open',
    })

    const stdout = await runCmd(AliasListCommand, ['--output', 'json'])
    const output = JSON.parse(stdout)

    expect(Array.isArray(output)).toBe(true)
    expect(output).toHaveLength(2)
    expect(output).toContainEqual({ name: 'wd', command: 'deal list' })
    expect(output).toContainEqual({
      name: 'open',
      command: 'deal list --status open',
    })
  })
})

describe('alias unset', () => {
  beforeEach(() => {
    mockSetAlias.mockReset()
    mockGetAlias.mockReset()
    mockUnsetAlias.mockReset()
    mockGetAliases.mockReset()
  })

  it('removes an existing alias and logs confirmation', async () => {
    mockGetAlias.mockReturnValue('deal list')

    const stdout = await runCmd(AliasUnsetCommand, ['wd'])

    expect(mockUnsetAlias).toHaveBeenCalledWith('wd')
    expect(stdout).toContain('Alias removed')
    expect(stdout).toContain('wd')
  })

  it('logs not-found and does not call unsetAlias for missing alias', async () => {
    mockGetAlias.mockReturnValue(undefined)

    const stdout = await runCmd(AliasUnsetCommand, ['missing'])

    expect(mockUnsetAlias).not.toHaveBeenCalled()
    expect(stdout).toContain('not found')
    expect(stdout).toContain('missing')
  })
})
