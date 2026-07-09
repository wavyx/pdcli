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

  it('rejects malformed --body JSON with exit 65 (not an internal 70)', async () => {
    const err = await ApiCommand.run([
      'POST',
      '/api/v2/deals',
      '--body',
      '{not json',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
    expect(err.message).toMatch(/JSON/i)
  })

  it('reads the request body from piped stdin', async () => {
    const { Readable } = await import('node:stream')
    const origStdin = process.stdin
    const mockStdin = Readable.from([Buffer.from('{"title":"Piped"}\n')])
    mockStdin.isTTY = false
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    })
    try {
      mockApi()
        .post('/api/v2/deals', { title: 'Piped' })
        .reply(201, { success: true, data: { id: 7 } })
      const stdout = await runCmd(ApiCommand, ['POST', '/api/v2/deals'])
      expect(JSON.parse(stdout).data.id).toBe(7)
    } finally {
      Object.defineProperty(process, 'stdin', {
        value: origStdin,
        writable: true,
        configurable: true,
      })
    }
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

describe('api --paginate', () => {
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

  it('follows v2 next_cursor across pages and concatenates', async () => {
    mockApi()
      .get('/api/v2/deals')
      .reply(200, {
        success: true,
        data: [{ id: 1 }, { id: 2 }],
        additional_data: { next_cursor: 'abc' },
      })
    mockApi()
      .get('/api/v2/deals')
      .query({ cursor: 'abc' })
      .reply(200, {
        success: true,
        data: [{ id: 3 }],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      '/api/v2/deals',
      '--paginate',
    ])

    const items = JSON.parse(stdout)
    expect(items.map((d) => d.id)).toEqual([1, 2, 3])
  })

  it('follows v1 next_start until more_items_in_collection is false', async () => {
    mockApi()
      .get('/api/v1/activities')
      .reply(200, {
        success: true,
        data: [{ id: 1 }],
        additional_data: {
          pagination: { more_items_in_collection: true, next_start: 1 },
        },
      })
    mockApi()
      .get('/api/v1/activities')
      .query({ start: '1' })
      .reply(200, {
        success: true,
        data: [{ id: 2 }],
        additional_data: {
          pagination: { more_items_in_collection: false },
        },
      })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      '/api/v1/activities',
      '--paginate',
    ])

    expect(JSON.parse(stdout).map((d) => d.id)).toEqual([1, 2])
  })

  it('accepts --all as an alias for --paginate', async () => {
    mockApi()
      .get('/api/v2/deals')
      .reply(200, {
        success: true,
        data: [{ id: 1 }],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ApiCommand, ['GET', '/api/v2/deals', '--all'])

    expect(JSON.parse(stdout).map((d) => d.id)).toEqual([1])
  })

  it('caps total items at --limit and stops fetching early', async () => {
    const page1 = mockApi()
      .get('/api/v2/deals')
      .reply(200, {
        success: true,
        data: [{ id: 1 }, { id: 2 }],
        additional_data: { next_cursor: 'abc' },
      })
    const page2 = mockApi()
      .get('/api/v2/deals')
      .query({ cursor: 'abc' })
      .reply(200, {
        success: true,
        data: [{ id: 3 }],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      '/api/v2/deals',
      '--paginate',
      '--limit',
      '2',
    ])

    expect(JSON.parse(stdout).map((d) => d.id)).toEqual([1, 2])
    expect(page1.isDone()).toBe(true)
    expect(page2.isDone()).toBe(false)
  })

  it('preserves an existing querystring into the first page', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ status: 'open' })
      .reply(200, {
        success: true,
        data: [{ id: 5 }],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      '/api/v2/deals?status=open',
      '--paginate',
    ])

    expect(JSON.parse(stdout).map((d) => d.id)).toEqual([5])
  })

  it('routes the collected array through --jq', async () => {
    mockApi()
      .get('/api/v2/deals')
      .reply(200, {
        success: true,
        data: [{ id: 1 }, { id: 2 }],
        additional_data: { next_cursor: null },
      })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      '/api/v2/deals',
      '--paginate',
      '--jq',
      'length',
    ])

    expect(stdout.trim()).toBe('2')
  })

  it('rejects --paginate on POST with exit 64', async () => {
    const err = await ApiCommand.run([
      'POST',
      '/api/v2/deals',
      '--paginate',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('rejects a path with no /api/v1|v2/ marker with exit 64', async () => {
    const err = await ApiCommand.run(['GET', '/foo/bar', '--paginate']).catch(
      (e) => e,
    )
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
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
