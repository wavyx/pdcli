import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import nock from 'nock'
import { createClient } from '../../src/lib/client.js'
import { ApiError, RateLimitError } from '../../src/lib/errors.js'

const API_BASE = 'https://acme.pipedrive.com'

describe('createClient', () => {
  let client

  beforeEach(() => {
    nock.cleanAll()
    client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('GET requests', () => {
    it('returns the parsed envelope on success', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/deals/1')
        .reply(200, { success: true, data: { id: 1, title: 'Big deal' } })

      const result = await client.get('/api/v2/deals/1')
      expect(result).toEqual({
        success: true,
        data: { id: 1, title: 'Big deal' },
      })
      expect(scope.isDone()).toBe(true)
    })

    it('sends the x-api-token header (not Authorization)', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/users/me')
        .matchHeader('x-api-token', 'test-token')
        .matchHeader('authorization', (v) => v === undefined)
        .reply(200, { success: true, data: {} })

      await client.get('/api/v2/users/me')
      expect(scope.isDone()).toBe(true)
    })

    it('reaches v1 paths on the same company host', async () => {
      const scope = nock(API_BASE)
        .get('/api/v1/currencies')
        .reply(200, { success: true, data: [{ code: 'EUR' }] })

      const result = await client.get('/api/v1/currencies')
      expect(result.data).toEqual([{ code: 'EUR' }])
      expect(scope.isDone()).toBe(true)
    })

    it('returns null for 204 responses', async () => {
      const scope = nock(API_BASE).get('/api/v2/deals/1').reply(204)

      const result = await client.get('/api/v2/deals/1')
      expect(result).toBeNull()
      expect(scope.isDone()).toBe(true)
    })

    it('passes query parameters', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/deals')
        .query({ status: 'open', limit: '10' })
        .reply(200, { success: true, data: [] })

      const result = await client.get('/api/v2/deals', {
        query: { status: 'open', limit: 10 },
      })
      expect(result).toEqual({ success: true, data: [] })
      expect(scope.isDone()).toBe(true)
    })

    it('skips null/undefined query values', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/deals')
        .query((q) => !('foo' in q) && !('bar' in q) && q.limit === '5')
        .reply(200, {})

      await client.get('/api/v2/deals', {
        query: { foo: null, bar: undefined, limit: 5 },
      })
      expect(scope.isDone()).toBe(true)
    })
  })

  describe('error handling', () => {
    it('throws ApiError for non-ok responses', async () => {
      nock(API_BASE)
        .get('/api/v2/deals/999')
        .reply(404, { success: false, error: 'Deal not found' })

      await expect(client.get('/api/v2/deals/999')).rejects.toThrow(ApiError)
    })

    it('throws ApiError with Pipedrive error message and status', async () => {
      nock(API_BASE)
        .get('/api/v2/bad')
        .reply(400, { success: false, error: 'Invalid field' })

      try {
        await client.get('/api/v2/bad')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.statusCode).toBe(400)
        expect(err.exitCode).toBe(65)
        expect(err.message).toContain('Invalid field')
      }
    })

    it('throws ApiError (77) on 401 without retrying', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/users/me')
        .reply(401, { success: false, error: 'invalid token' })

      try {
        await client.get('/api/v2/users/me')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.statusCode).toBe(401)
        expect(err.exitCode).toBe(77)
      }
      expect(scope.isDone()).toBe(true)
    })

    it('throws RateLimitError on 429 when retry is false', async () => {
      nock(API_BASE)
        .get('/api/v2/limited')
        .reply(429, '', { 'x-ratelimit-reset': '15' })

      try {
        await client.get('/api/v2/limited')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError)
        expect(err.retryAfter).toBe(15)
        expect(err.exitCode).toBe(75)
      }
    })

    it('falls back to Retry-After header on 429', async () => {
      nock(API_BASE)
        .get('/api/v2/limited')
        .reply(429, '', { 'retry-after': '7' })

      try {
        await client.get('/api/v2/limited')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err.retryAfter).toBe(7)
      }
    })

    it('defaults retry-after to 2 seconds when headers missing on 429', async () => {
      nock(API_BASE).get('/api/v2/limited').reply(429)

      try {
        await client.get('/api/v2/limited')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err.retryAfter).toBe(2)
      }
    })
  })

  describe('retry behavior', () => {
    it('retries on 429 when retry is enabled', async () => {
      const retryClient = createClient({
        companyDomain: 'acme',
        token: 'test-token',
        retry: true,
        timeout: 5000,
      })

      const scope = nock(API_BASE)
        .get('/api/v2/data')
        .reply(429, '', { 'x-ratelimit-reset': '0' })
        .get('/api/v2/data')
        .reply(200, { success: true, data: [] })

      const result = await retryClient.get('/api/v2/data')
      expect(result).toEqual({ success: true, data: [] })
      expect(scope.isDone()).toBe(true)
    })

    it('hard-stops when a 403 follows a 429 (rate-limit escalation)', async () => {
      const retryClient = createClient({
        companyDomain: 'acme',
        token: 'test-token',
        retry: true,
        timeout: 5000,
      })

      const scope = nock(API_BASE)
        .get('/api/v2/data')
        .reply(429, '', { 'x-ratelimit-reset': '0' })
        .get('/api/v2/data')
        .reply(403, { success: false, error: 'Forbidden' })

      try {
        await retryClient.get('/api/v2/data')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.statusCode).toBe(403)
        expect(err.exitCode).toBe(77)
        expect(err.message).toMatch(/rate.limit/i)
      }
      expect(scope.isDone()).toBe(true)
    })

    it('retries on 5xx with backoff', async () => {
      const retryClient = createClient({
        companyDomain: 'acme',
        token: 'test-token',
        retry: true,
        timeout: 5000,
      })

      const scope = nock(API_BASE)
        .get('/api/v2/flaky')
        .reply(500, { success: false, error: 'Internal Server Error' })
        .get('/api/v2/flaky')
        .reply(200, { success: true, data: { recovered: true } })

      const result = await retryClient.get('/api/v2/flaky')
      expect(result.data).toEqual({ recovered: true })
      expect(scope.isDone()).toBe(true)
    })

    it('throws ApiError on final 5xx attempt after exhausting retries', async () => {
      const retryClient = createClient({
        companyDomain: 'acme',
        token: 'test-token',
        retry: true,
        timeout: 5000,
      })

      const scope = nock(API_BASE)
        .get('/api/v2/down')
        .times(3)
        .reply(503, { success: false, error: 'Service Unavailable' })

      try {
        await retryClient.get('/api/v2/down')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.statusCode).toBe(503)
        expect(err.exitCode).toBe(69)
      }
      expect(scope.isDone()).toBe(true)
    }, 30_000)

    it('throws ServiceUnavailableError when 429 retries exhaust the loop', async () => {
      const retryClient = createClient({
        companyDomain: 'acme',
        token: 'test-token',
        retry: true,
        timeout: 5000,
      })

      const scope = nock(API_BASE)
        .get('/api/v2/throttled')
        .times(3)
        .reply(429, '', { 'x-ratelimit-reset': '0' })

      try {
        await retryClient.get('/api/v2/throttled')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err.message).toBe('Pipedrive API is unavailable')
        expect(err.exitCode).toBe(69)
      }
      expect(scope.isDone()).toBe(true)
    })
  })

  describe('pageV2 (cursor pagination)', () => {
    it('follows next_cursor across pages and yields data items', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/deals')
        .query({ limit: '2' })
        .reply(200, {
          success: true,
          data: [{ id: 1 }, { id: 2 }],
          additional_data: { next_cursor: 'abc' },
        })
        .get('/api/v2/deals')
        .query({ limit: '2', cursor: 'abc' })
        .reply(200, {
          success: true,
          data: [{ id: 3 }],
          additional_data: { next_cursor: null },
        })

      const items = []
      for await (const item of client.pageV2('/api/v2/deals', { limit: 2 })) {
        items.push(item)
      }

      expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
      expect(scope.isDone()).toBe(true)
    })

    it('stops after a single page when next_cursor is absent', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/pipelines')
        .reply(200, { success: true, data: [{ id: 1 }] })

      const items = []
      for await (const item of client.pageV2('/api/v2/pipelines')) {
        items.push(item)
      }

      expect(items).toEqual([{ id: 1 }])
      expect(scope.isDone()).toBe(true)
    })

    it('yields nothing for an empty data array', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/deals')
        .reply(200, {
          success: true,
          data: [],
          additional_data: { next_cursor: null },
        })

      const items = []
      for await (const item of client.pageV2('/api/v2/deals')) {
        items.push(item)
      }

      expect(items).toEqual([])
      expect(scope.isDone()).toBe(true)
    })

    it('clamps the page limit to 500', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/deals')
        .query({ limit: '500' })
        .reply(200, { success: true, data: [] })

      const items = []
      for await (const item of client.pageV2('/api/v2/deals', {
        limit: 9999,
      })) {
        items.push(item)
      }

      expect(scope.isDone()).toBe(true)
    })
  })

  describe('pageV1 (offset pagination)', () => {
    it('follows next_start while more_items_in_collection', async () => {
      const scope = nock(API_BASE)
        .get('/api/v1/notes')
        .query({ limit: '2' })
        .reply(200, {
          success: true,
          data: [{ id: 1 }, { id: 2 }],
          additional_data: {
            pagination: {
              start: 0,
              limit: 2,
              more_items_in_collection: true,
              next_start: 2,
            },
          },
        })
        .get('/api/v1/notes')
        .query({ limit: '2', start: '2' })
        .reply(200, {
          success: true,
          data: [{ id: 3 }],
          additional_data: {
            pagination: {
              start: 2,
              limit: 2,
              more_items_in_collection: false,
            },
          },
        })

      const items = []
      for await (const item of client.pageV1('/api/v1/notes', { limit: 2 })) {
        items.push(item)
      }

      expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
      expect(scope.isDone()).toBe(true)
    })

    it('stops when pagination metadata is missing', async () => {
      const scope = nock(API_BASE)
        .get('/api/v1/currencies')
        .reply(200, { success: true, data: [{ id: 1 }] })

      const items = []
      for await (const item of client.pageV1('/api/v1/currencies')) {
        items.push(item)
      }

      expect(items).toEqual([{ id: 1 }])
      expect(scope.isDone()).toBe(true)
    })

    it('handles null data on a page', async () => {
      const scope = nock(API_BASE)
        .get('/api/v1/notes')
        .reply(200, { success: true, data: null })

      const items = []
      for await (const item of client.pageV1('/api/v1/notes')) {
        items.push(item)
      }

      expect(items).toEqual([])
      expect(scope.isDone()).toBe(true)
    })

    it('clamps the page limit to 500', async () => {
      const scope = nock(API_BASE)
        .get('/api/v1/notes')
        .query({ limit: '500' })
        .reply(200, { success: true, data: [] })

      const items = []
      for await (const item of client.pageV1('/api/v1/notes', {
        limit: 1000,
      })) {
        items.push(item)
      }

      expect(scope.isDone()).toBe(true)
    })
  })

  describe('write requests', () => {
    it('POST sends a JSON body and content-type', async () => {
      const scope = nock(API_BASE)
        .post('/api/v2/deals', { title: 'New deal' })
        .matchHeader('content-type', 'application/json')
        .reply(201, { success: true, data: { id: 1 } })

      const result = await client.post('/api/v2/deals', {
        body: { title: 'New deal' },
      })
      expect(result.data).toEqual({ id: 1 })
      expect(scope.isDone()).toBe(true)
    })

    it('PATCH sends a JSON body (v2 update verb)', async () => {
      const scope = nock(API_BASE)
        .patch('/api/v2/deals/1', { title: 'Updated' })
        .reply(200, { success: true, data: { id: 1, title: 'Updated' } })

      const result = await client.patch('/api/v2/deals/1', {
        body: { title: 'Updated' },
      })
      expect(result.data.title).toBe('Updated')
      expect(scope.isDone()).toBe(true)
    })

    it('PUT is available for v1 endpoints', async () => {
      const scope = nock(API_BASE)
        .put('/api/v1/notes/1', { content: 'x' })
        .reply(200, { success: true, data: { id: 1 } })

      const result = await client.put('/api/v1/notes/1', {
        body: { content: 'x' },
      })
      expect(result.data).toEqual({ id: 1 })
      expect(scope.isDone()).toBe(true)
    })

    it('DELETE works and returns null on 204', async () => {
      const scope = nock(API_BASE).delete('/api/v2/deals/1').reply(204)

      const result = await client.del('/api/v2/deals/1')
      expect(result).toBeNull()
      expect(scope.isDone()).toBe(true)
    })
  })

  describe('host locking', () => {
    it('refuses a protocol-relative path that resolves off-host', async () => {
      nock.disableNetConnect()
      try {
        await expect(client.get('//evil.com/steal')).rejects.toThrow(
          /Pipedrive company host/i,
        )
      } finally {
        nock.enableNetConnect()
      }
    })

    it('refuses an absolute off-host URL as the path', async () => {
      nock.disableNetConnect()
      try {
        await expect(client.get('https://evil.com/steal')).rejects.toThrow(
          /Pipedrive company host/i,
        )
      } finally {
        nock.enableNetConnect()
      }
    })

    it("refuses another company's pipedrive.com subdomain", async () => {
      nock.disableNetConnect()
      try {
        await expect(
          client.get('https://other-company.pipedrive.com/api/v2/deals'),
        ).rejects.toThrow(/Pipedrive company host/i)
      } finally {
        nock.enableNetConnect()
      }
    })

    it('still allows normal relative API paths', async () => {
      const scope = nock(API_BASE)
        .get('/api/v2/ok')
        .reply(200, { success: true })
      const result = await client.get('/api/v2/ok')
      expect(result).toEqual({ success: true })
      expect(scope.isDone()).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('returns null for an empty response body', async () => {
      nock(API_BASE).get('/api/v2/empty').reply(200, '')

      const result = await client.get('/api/v2/empty')
      expect(result).toBeNull()
    })

    it('sends the provided User-Agent header', async () => {
      nock.disableNetConnect()
      try {
        const uaClient = createClient({
          companyDomain: 'acme',
          token: 'test-token',
          retry: false,
          timeout: 5000,
          userAgent: 'pdcli/9.9.9',
        })
        const scope = nock(API_BASE)
          .get('/api/v2/ua')
          .matchHeader('user-agent', 'pdcli/9.9.9')
          .reply(200, { success: true })
        await uaClient.get('/api/v2/ua')
        expect(scope.isDone()).toBe(true)
      } finally {
        nock.enableNetConnect()
      }
    })
  })
})

describe('array query values', () => {
  it('joins array values with commas (Pipedrive convention)', async () => {
    nock.cleanAll()
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .get('/api/v2/itemSearch')
      .query({ item_types: 'deal,person' })
      .reply(200, { success: true, data: { items: [] } })

    await client.get('/api/v2/itemSearch', {
      query: { item_types: ['deal', 'person'] },
    })
    expect(scope.isDone()).toBe(true)
  })
})

describe('pageV2 with an empty response body', () => {
  it('yields nothing and stops', async () => {
    nock.cleanAll()
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    nock('https://acme.pipedrive.com').get('/api/v2/deals').reply(200, '')

    const items = []
    for await (const item of client.pageV2('/api/v2/deals')) {
      items.push(item)
    }

    expect(items).toEqual([])
  })
})

describe('OAuth mode', () => {
  beforeEach(() => nock.cleanAll())

  it('sends Authorization Bearer and uses the api_domain origin', async () => {
    const oauthClient = createClient({
      apiDomain: 'https://acme.pipedrive.com',
      token: 'oauth-access',
      authMode: 'oauth',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .get('/api/v2/deals')
      .matchHeader('authorization', 'Bearer oauth-access')
      .matchHeader('x-api-token', (v) => v === undefined)
      .reply(200, { success: true, data: [] })

    await oauthClient.get('/api/v2/deals')
    expect(scope.isDone()).toBe(true)
  })

  it('host-locks to the api_domain', async () => {
    const oauthClient = createClient({
      apiDomain: 'https://acme.pipedrive.com',
      token: 'oauth-access',
      authMode: 'oauth',
      retry: false,
      timeout: 5000,
    })
    nock.disableNetConnect()
    try {
      await expect(
        oauthClient.get('https://other.pipedrive.com/api/v2/deals'),
      ).rejects.toThrow(/Pipedrive company host/i)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('refreshes once via onRefresh on 401 and retries with the new token', async () => {
    const onRefresh = vi.fn().mockResolvedValue('refreshed-access')
    const oauthClient = createClient({
      apiDomain: 'https://acme.pipedrive.com',
      token: 'expired-access',
      authMode: 'oauth',
      onRefresh,
      retry: true,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .get('/api/v2/users/me')
      .matchHeader('authorization', 'Bearer expired-access')
      .reply(401, { success: false, error: 'expired' })
      .get('/api/v2/users/me')
      .matchHeader('authorization', 'Bearer refreshed-access')
      .reply(200, { success: true, data: { id: 1 } })

    const result = await oauthClient.get('/api/v2/users/me')
    expect(result.data.id).toBe(1)
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(scope.isDone()).toBe(true)
  })

  it('throws ApiError when the refreshed token is also rejected', async () => {
    const onRefresh = vi.fn().mockResolvedValue('still-bad')
    const oauthClient = createClient({
      apiDomain: 'https://acme.pipedrive.com',
      token: 'expired-access',
      authMode: 'oauth',
      onRefresh,
      retry: true,
      timeout: 5000,
    })
    nock('https://acme.pipedrive.com')
      .get('/api/v2/users/me')
      .times(2)
      .reply(401, { success: false, error: 'expired' })

    await expect(oauthClient.get('/api/v2/users/me')).rejects.toMatchObject({
      statusCode: 401,
      exitCode: 77,
    })
    expect(onRefresh).toHaveBeenCalledOnce()
  })
})

describe('binary download', () => {
  beforeEach(() => nock.cleanAll())

  it('returns the raw bytes and content type', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    nock('https://acme.pipedrive.com')
      .get('/api/v1/files/7/download')
      .reply(200, Buffer.from('PDF-BYTES'), {
        'content-type': 'application/pdf',
      })

    const { buffer, contentType } = await client.download(
      '/api/v1/files/7/download',
    )

    expect(Buffer.from(buffer).toString()).toBe('PDF-BYTES')
    expect(contentType).toBe('application/pdf')
  })

  it('throws ApiError on a failed download', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    nock('https://acme.pipedrive.com')
      .get('/api/v1/files/404/download')
      .reply(404, { success: false, error: 'File not found' })

    await expect(
      client.download('/api/v1/files/404/download'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('host-locks downloads', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    nock.disableNetConnect()
    try {
      await expect(client.download('https://evil.com/x')).rejects.toThrow(
        /Pipedrive company host/i,
      )
    } finally {
      nock.enableNetConnect()
    }
  })
})

describe('multipart upload', () => {
  beforeEach(() => nock.cleanAll())

  it('POSTs multipart/form-data with the file and fields', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .post('/api/v1/files', (body) => {
        const s = String(body)
        return (
          s.includes('name="file"') &&
          s.includes('filename="note.txt"') &&
          s.includes('hello upload') &&
          s.includes('name="deal_id"') &&
          s.includes('42')
        )
      })
      .matchHeader('content-type', /multipart\/form-data/)
      .matchHeader('x-api-token', 'test-token')
      .reply(201, { success: true, data: { id: 9, name: 'note.txt' } })

    const result = await client.postMultipart('/api/v1/files', {
      file: { name: 'note.txt', data: Buffer.from('hello upload') },
      fields: { deal_id: 42 },
    })

    expect(result.data.id).toBe(9)
    expect(scope.isDone()).toBe(true)
  })

  it('throws ApiError on upload failure', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    nock('https://acme.pipedrive.com')
      .post('/api/v1/files')
      .reply(400, { success: false, error: 'bad upload' })

    await expect(
      client.postMultipart('/api/v1/files', {
        file: { name: 'x.txt', data: Buffer.from('x') },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('binary + multipart in OAuth mode / edge bodies', () => {
  beforeEach(() => nock.cleanAll())

  it('download sends Bearer in oauth mode', async () => {
    const client = createClient({
      apiDomain: 'https://acme.pipedrive.com',
      token: 'oauth-at',
      authMode: 'oauth',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .get('/api/v1/files/1/download')
      .matchHeader('authorization', 'Bearer oauth-at')
      .reply(200, Buffer.from('x'), { 'content-type': 'text/plain' })

    await client.download('/api/v1/files/1/download')
    expect(scope.isDone()).toBe(true)
  })

  it('postMultipart returns null for an empty response body', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    nock('https://acme.pipedrive.com').post('/api/v1/files').reply(204, '')

    const result = await client.postMultipart('/api/v1/files', {
      file: { name: 'x.txt', data: Buffer.from('x') },
    })
    expect(result).toBeNull()
  })
})

describe('postForm (application/x-www-form-urlencoded)', () => {
  beforeEach(() => nock.cleanAll())

  it('POSTs a urlencoded body with the form content-type', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .post('/api/v1/files/remoteLink', (body) => {
        const params = new URLSearchParams(body)
        return (
          params.get('item_type') === 'deal' &&
          params.get('item_id') === '42' &&
          params.get('remote_id') === 'abc123' &&
          params.get('remote_location') === 'googledrive'
        )
      })
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .matchHeader('x-api-token', 'test-token')
      .reply(200, { success: true, data: { id: 9 } })

    const result = await client.postForm('/api/v1/files/remoteLink', {
      item_type: 'deal',
      item_id: 42,
      remote_id: 'abc123',
      remote_location: 'googledrive',
    })

    expect(result.data.id).toBe(9)
    expect(scope.isDone()).toBe(true)
  })

  it('omits null/undefined fields from the body', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .post('/api/v1/files/remoteLink', (body) => {
        // nock parses urlencoded bodies into a plain object.
        return (
          body.item_type === 'deal' &&
          !('remote_id' in body) &&
          !('remote_location' in body)
        )
      })
      .reply(200, { success: true, data: { id: 1 } })

    await client.postForm('/api/v1/files/remoteLink', {
      item_type: 'deal',
      remote_id: null,
      remote_location: undefined,
    })
    expect(scope.isDone()).toBe(true)
  })

  it('sends Bearer auth in oauth mode', async () => {
    const client = createClient({
      apiDomain: 'https://acme.pipedrive.com',
      token: 'oauth-at',
      authMode: 'oauth',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .post('/api/v1/files/remoteLink')
      .matchHeader('authorization', 'Bearer oauth-at')
      .reply(200, { success: true, data: { id: 2 } })

    await client.postForm('/api/v1/files/remoteLink', { item_type: 'deal' })
    expect(scope.isDone()).toBe(true)
  })

  it('throws ApiError on failure', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    nock('https://acme.pipedrive.com')
      .post('/api/v1/files/remoteLink')
      .reply(400, { success: false, error: 'bad link' })

    await expect(
      client.postForm('/api/v1/files/remoteLink', { item_type: 'deal' }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns null for an empty response body', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    nock('https://acme.pipedrive.com')
      .post('/api/v1/files/remoteLink')
      .reply(204, '')

    const result = await client.postForm('/api/v1/files/remoteLink', {
      item_type: 'deal',
    })
    expect(result).toBeNull()
  })

  it('refuses to send outside the locked host', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    await expect(
      client.postForm('https://evil.example.com/api/v1/files/remoteLink', {}),
    ).rejects.toThrow(/Refusing to send request outside/)
  })
})
describe('putForm (application/x-www-form-urlencoded)', () => {
  beforeEach(() => nock.cleanAll())

  it('PUTs a urlencoded body with the form content-type', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .put('/api/v1/files/9', (body) => {
        const params = new URLSearchParams(body)
        return (
          params.get('name') === 'renamed.pdf' &&
          params.get('description') === 'Q3 report'
        )
      })
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .matchHeader('x-api-token', 'test-token')
      .reply(200, { success: true, data: { id: 9 } })

    const result = await client.putForm('/api/v1/files/9', {
      name: 'renamed.pdf',
      description: 'Q3 report',
    })

    expect(result.data.id).toBe(9)
    expect(scope.isDone()).toBe(true)
  })

  it('omits null/undefined fields from the body', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    const scope = nock('https://acme.pipedrive.com')
      .put('/api/v1/files/9', (body) => {
        return body.name === 'renamed.pdf' && !('description' in body)
      })
      .reply(200, { success: true, data: { id: 9 } })

    await client.putForm('/api/v1/files/9', {
      name: 'renamed.pdf',
      description: null,
    })
    expect(scope.isDone()).toBe(true)
  })

  it('refuses to send outside the locked host', async () => {
    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    await expect(
      client.putForm('https://evil.example.com/api/v1/files/9', {}),
    ).rejects.toThrow(/Refusing to send request outside/)
  })
})
describe('unified transport: retry/refresh on non-JSON paths', () => {
  beforeEach(() => nock.cleanAll())

  const BASE = 'https://acme.pipedrive.com'
  const tokenClient = (retry = true) =>
    createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry,
      timeout: 5000,
    })

  it('postForm retries a 429 honoring retry-after', async () => {
    nock(BASE)
      .post('/api/v1/files/remoteLink')
      .reply(429, {}, { 'retry-after': '0' })
    nock(BASE)
      .post('/api/v1/files/remoteLink')
      .reply(200, { success: true, data: { id: 1 } })

    const res = await tokenClient().postForm('/api/v1/files/remoteLink', {
      item_type: 'deal',
    })
    expect(res.data.id).toBe(1)
  })

  it('postForm surfaces 429 immediately with retry disabled', async () => {
    nock(BASE)
      .post('/api/v1/files/remoteLink')
      .reply(429, {}, { 'retry-after': '0' })

    await expect(
      tokenClient(false).postForm('/api/v1/files/remoteLink', {}),
    ).rejects.toMatchObject({ exitCode: 75 })
  })

  it('postMultipart retries a 429 honoring retry-after', async () => {
    nock(BASE).post('/api/v1/files').reply(429, {}, { 'retry-after': '0' })
    nock(BASE)
      .post('/api/v1/files')
      .reply(200, { success: true, data: { id: 5 } })

    const res = await tokenClient().postMultipart('/api/v1/files', {
      file: { name: 'a.txt', data: Buffer.from('hi') },
    })
    expect(res.data.id).toBe(5)
  })

  it('postMultipart surfaces 429 immediately with retry disabled', async () => {
    nock(BASE).post('/api/v1/files').reply(429, {}, { 'retry-after': '0' })

    await expect(
      tokenClient(false).postMultipart('/api/v1/files', {
        file: { name: 'a.txt', data: Buffer.from('hi') },
      }),
    ).rejects.toMatchObject({ exitCode: 75 })
  })

  it('download retries a 429 honoring retry-after', async () => {
    nock(BASE)
      .get('/api/v1/files/9/download')
      .reply(429, {}, { 'retry-after': '0' })
    nock(BASE).get('/api/v1/files/9/download').reply(200, 'binarydata', {
      'content-type': 'application/pdf',
    })

    const res = await tokenClient().download('/api/v1/files/9/download')
    expect(Buffer.from(res.buffer).toString()).toBe('binarydata')
    expect(res.contentType).toBe('application/pdf')
  })

  it('download retries 5xx with backoff', async () => {
    nock(BASE).get('/api/v1/files/9/download').reply(502, 'bad gateway')
    nock(BASE).get('/api/v1/files/9/download').reply(200, 'ok', {
      'content-type': 'text/plain',
    })

    const res = await tokenClient().download('/api/v1/files/9/download')
    expect(Buffer.from(res.buffer).toString()).toBe('ok')
  })

  it('postForm refreshes the OAuth token once on 401 and retries', async () => {
    const onRefresh = vi.fn().mockResolvedValue('fresh-token')
    const client = createClient({
      apiDomain: 'https://acme.pipedrive.com',
      token: 'stale',
      authMode: 'oauth',
      onRefresh,
      retry: true,
      timeout: 5000,
    })
    nock(BASE)
      .post('/api/v1/files/remoteLink')
      .matchHeader('authorization', 'Bearer stale')
      .reply(401, { success: false, error: 'unauthorized' })
    nock(BASE)
      .post('/api/v1/files/remoteLink')
      .matchHeader('authorization', 'Bearer fresh-token')
      .reply(200, { success: true, data: { id: 2 } })

    const res = await client.postForm('/api/v1/files/remoteLink', {})
    expect(res.data.id).toBe(2)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('download refreshes the OAuth token once on 401 and retries', async () => {
    const onRefresh = vi.fn().mockResolvedValue('fresh-token')
    const client = createClient({
      apiDomain: 'https://acme.pipedrive.com',
      token: 'stale',
      authMode: 'oauth',
      onRefresh,
      retry: true,
      timeout: 5000,
    })
    nock(BASE)
      .get('/api/v1/files/9/download')
      .matchHeader('authorization', 'Bearer stale')
      .reply(401, 'no')
    nock(BASE)
      .get('/api/v1/files/9/download')
      .matchHeader('authorization', 'Bearer fresh-token')
      .reply(200, 'data', { 'content-type': 'text/plain' })

    const res = await client.download('/api/v1/files/9/download')
    expect(Buffer.from(res.buffer).toString()).toBe('data')
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('postMultipart hard-stops on 403 after a 429 (escalation)', async () => {
    nock(BASE).post('/api/v1/files').reply(429, {}, { 'retry-after': '0' })
    nock(BASE).post('/api/v1/files').reply(403, { error: 'blocked' })

    await expect(
      tokenClient().postMultipart('/api/v1/files', {
        file: { name: 'a.txt', data: Buffer.from('hi') },
      }),
    ).rejects.toThrow(/rate-limit escalation/)
  })

  it('download returns an empty buffer on 204, not null', async () => {
    nock(BASE).get('/api/v1/files/9/download').reply(204)

    const res = await tokenClient().download('/api/v1/files/9/download')
    expect(res).not.toBeNull()
    expect(res.buffer.byteLength).toBe(0)
  })
})

describe('daily budget exhaustion', () => {
  beforeEach(() => nock.cleanAll())
  const BASE2 = 'https://acme.pipedrive.com'

  it('fails fast when the daily token budget is exhausted (live header name)', async () => {
    // The live API reports the budget as x-daily-ratelimit-token-remaining
    // (verified against the sandbox); a retry-after is present but useless —
    // backoff would stall until midnight. Fail immediately instead.
    nock(BASE2)
      .get('/api/v2/deals')
      .reply(
        429,
        {},
        { 'x-daily-ratelimit-token-remaining': '0', 'retry-after': '3' },
      )

    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: true,
      timeout: 5000,
    })
    await expect(client.get('/api/v2/deals')).rejects.toThrow(
      /daily.*budget|daily.*limit/i,
    )
  })

  it('fails fast on the legacy x-daily-requests-left header too', async () => {
    nock(BASE2)
      .get('/api/v2/deals')
      .reply(429, {}, { 'x-daily-requests-left': '0' })

    const legacy = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: true,
      timeout: 5000,
    })
    await expect(legacy.get('/api/v2/deals')).rejects.toThrow(
      /daily.*budget|daily.*limit/i,
    )
  })

  it('reads the remaining daily budget from successful responses', async () => {
    nock(BASE2)
      .get('/api/v2/deals')
      .reply(
        200,
        { success: true, data: [] },
        { 'x-daily-ratelimit-token-remaining': '127320' },
      )

    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: false,
      timeout: 5000,
    })
    // The header is surfaced via debug logging — the assertion here is that
    // the success path with the header present completes normally.
    const res = await client.get('/api/v2/deals')
    expect(res.success).toBe(true)
  })

  it('still retries a normal burst 429 that has a reset window', async () => {
    nock(BASE2)
      .get('/api/v2/deals')
      .reply(
        429,
        {},
        { 'retry-after': '0', 'x-daily-ratelimit-token-remaining': '4100' },
      )
    nock(BASE2).get('/api/v2/deals').reply(200, { success: true, data: [] })

    const client = createClient({
      companyDomain: 'acme',
      token: 'test-token',
      retry: true,
      timeout: 5000,
    })
    const res = await client.get('/api/v2/deals')
    expect(res.success).toBe(true)
  })
})
