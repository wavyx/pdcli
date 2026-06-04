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
