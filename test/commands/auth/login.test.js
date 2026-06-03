import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockSetToken = vi.fn()
vi.mock('../../../src/lib/keychain.js', () => ({
  setToken: mockSetToken,
}))

const mockSetProfileConfig = vi.fn()
vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
  setProfileConfig: mockSetProfileConfig,
}))

const mockInput = vi.fn()
const mockPassword = vi.fn()
vi.mock('@inquirer/prompts', () => ({
  input: mockInput,
  password: mockPassword,
}))

const { default: LoginCommand } =
  await import('../../../src/commands/auth/login.js')
import { runCmd } from '../../helpers.js'

describe('auth login', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockSetToken.mockReset()
    mockSetProfileConfig.mockReset()
    mockInput.mockReset()
    mockPassword.mockReset()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('validates and stores credentials passed via flags', async () => {
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .matchHeader('x-api-token', 'tok-123')
      .reply(200, {
        success: true,
        data: { id: 1, name: 'Jane Doe', email: 'jane@acme.com' },
      })

    const stdout = await runCmd(LoginCommand, [
      '--company',
      'acme',
      '--api-token',
      'tok-123',
    ])

    expect(mockSetToken).toHaveBeenCalledWith('default', 'tok-123')
    expect(mockSetProfileConfig).toHaveBeenCalledWith(
      'default',
      'company_domain',
      'acme',
    )
    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('Logged in')
  })

  it('prompts for domain and token when flags are missing', async () => {
    mockInput.mockResolvedValue('acme')
    mockPassword.mockResolvedValue('prompted-token')

    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .matchHeader('x-api-token', 'prompted-token')
      .reply(200, {
        success: true,
        data: { id: 2, name: 'Prompt User', email: 'p@acme.com' },
      })

    const stdout = await runCmd(LoginCommand)

    expect(mockInput).toHaveBeenCalled()
    expect(mockPassword).toHaveBeenCalled()
    expect(mockSetToken).toHaveBeenCalledWith('default', 'prompted-token')
    expect(stdout).toContain('Prompt User')
  })

  it('normalizes a pasted full URL to the bare subdomain', async () => {
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .reply(200, { success: true, data: { id: 1, name: 'N', email: 'n@a' } })

    await runCmd(LoginCommand, [
      '--company',
      'https://acme.pipedrive.com/',
      '--api-token',
      't',
    ])

    expect(mockSetProfileConfig).toHaveBeenCalledWith(
      'default',
      'company_domain',
      'acme',
    )
  })

  it('does not store anything when validation fails', async () => {
    nock('https://acme.pipedrive.com')
      .get('/api/v1/users/me')
      .reply(401, { success: false, error: 'invalid token' })

    await expect(
      LoginCommand.run(['--company', 'acme', '--api-token', 'bad']),
    ).rejects.toThrow(/401/)

    expect(mockSetToken).not.toHaveBeenCalled()
    expect(mockSetProfileConfig).not.toHaveBeenCalled()
  })
})
