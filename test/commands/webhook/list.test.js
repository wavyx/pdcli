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

const { default: WebhookListCommand } =
  await import('../../../src/commands/webhook/list.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('webhook list', () => {
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

  it('lists webhooks', async () => {
    mockApi()
      .get('/api/v1/webhooks')
      .reply(200, {
        success: true,
        data: [
          {
            id: 3,
            subscription_url: 'https://example.com/hook',
            event_action: 'change',
            event_object: 'deal',
            version: '2.0',
            is_active: 1,
          },
        ],
      })

    const stdout = await runCmd(WebhookListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)[0].id).toBe(3)
  })

  it('renders is_active falling back to active_flag', async () => {
    mockApi()
      .get('/api/v1/webhooks')
      .reply(200, {
        success: true,
        data: [
          {
            id: 3,
            subscription_url: 'https://example.com/hook',
            event_action: 'change',
            event_object: 'deal',
            version: '2.0',
            active_flag: 1,
          },
        ],
      })

    const stdout = await runCmd(WebhookListCommand, ['--output', 'table'])

    expect(stdout).toContain('https://example.com/hook')
  })

  it('blanks the active column when neither flag is present', async () => {
    mockApi()
      .get('/api/v1/webhooks')
      .reply(200, {
        success: true,
        data: [
          {
            id: 4,
            subscription_url: 'https://example.com/two',
            event_action: '*',
            event_object: '*',
            version: '2.0',
          },
        ],
      })

    const stdout = await runCmd(WebhookListCommand, ['--output', 'table'])

    expect(stdout).toContain('https://example.com/two')
  })
})
