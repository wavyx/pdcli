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

const { default: WebhookCreateCommand } =
  await import('../../../src/commands/webhook/create.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('webhook create', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('POSTs the required fields and defaults to version 2.0', async () => {
    mockApi()
      .post('/api/v1/webhooks', {
        subscription_url: 'https://example.com/hook',
        event_action: 'change',
        event_object: 'deal',
        version: '2.0',
      })
      .reply(201, {
        success: true,
        data: { id: 9, subscription_url: 'https://example.com/hook' },
      })

    const stdout = await runCmd(WebhookCreateCommand, [
      '--url',
      'https://example.com/hook',
      '--event-action',
      'change',
      '--event-object',
      'deal',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(9)
  })

  it('includes optional name, version and http auth', async () => {
    mockApi()
      .post('/api/v1/webhooks', {
        subscription_url: 'https://example.com/hook',
        event_action: '*',
        event_object: '*',
        version: '1.0',
        name: 'Everything',
        http_auth_user: 'user',
        http_auth_password: 'pass',
      })
      .reply(201, {
        success: true,
        data: { id: 10 },
      })

    const stdout = await runCmd(WebhookCreateCommand, [
      '--url',
      'https://example.com/hook',
      '--event-action',
      '*',
      '--event-object',
      '*',
      '--version',
      '1.0',
      '--name',
      'Everything',
      '--http-auth-user',
      'user',
      '--http-auth-password',
      'pass',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(10)
  })

  it('requires --url', async () => {
    await expect(
      WebhookCreateCommand.run([
        '--event-action',
        'change',
        '--event-object',
        'deal',
      ]),
    ).rejects.toThrow()
  })
})
