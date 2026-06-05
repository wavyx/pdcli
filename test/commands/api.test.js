import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: ApiCommand } = await import('../../src/commands/api.js')
import { runCmd, mockApi } from '../helpers.js'

describe('api', () => {
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

  it('forwards GET requests to v2 paths and prints the envelope', async () => {
    mockApi()
      .get('/api/v2/deals/1')
      .reply(200, { success: true, data: { id: 1 } })

    const stdout = await runCmd(ApiCommand, ['GET', '/api/v2/deals/1'])

    const parsed = JSON.parse(stdout)
    expect(parsed.success).toBe(true)
    expect(parsed.data.id).toBe(1)
  })

  it('forwards GET requests to v1 paths', async () => {
    mockApi()
      .get('/api/v1/currencies')
      .reply(200, { success: true, data: [{ code: 'EUR' }] })

    const stdout = await runCmd(ApiCommand, ['GET', '/api/v1/currencies'])

    expect(JSON.parse(stdout).data[0].code).toBe('EUR')
  })

  it('sends a JSON body on POST', async () => {
    mockApi()
      .post('/api/v2/deals', { title: 'New deal' })
      .reply(201, { success: true, data: { id: 9 } })

    const stdout = await runCmd(ApiCommand, [
      'POST',
      '/api/v2/deals',
      '--body',
      '{"title":"New deal"}',
    ])

    expect(JSON.parse(stdout).data.id).toBe(9)
  })

  it('refuses off-host absolute URLs (host-lock)', async () => {
    nock.disableNetConnect()
    try {
      await expect(
        ApiCommand.run(['GET', 'https://evil.com/steal']),
      ).rejects.toThrow(/Pipedrive company host/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('supports DELETE returning no content', async () => {
    mockApi().delete('/api/v2/deals/9').reply(204)

    const stdout = await runCmd(ApiCommand, ['DELETE', '/api/v2/deals/9'])

    expect(stdout).toBe('')
  })
})

describe('api --jq', () => {
  it('filters the raw response through jq', async () => {
    mockApi()
      .get('/api/v1/currencies')
      .reply(200, {
        success: true,
        data: [{ code: 'EUR' }, { code: 'USD' }],
      })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      '/api/v1/currencies',
      '--jq',
      // single envelope passes to jq unwrapped since 0.9
      '.data | length',
    ])

    expect(stdout.trim()).toBe('2')
  })
})
