import createDebug from 'debug'
import {
  ApiError,
  CliError,
  RateLimitError,
  ServiceUnavailableError,
} from './errors.js'
import { companyDomainToBaseOrigin } from './auth.js'

const debug = createDebug('pd:client')

/** Pipedrive caps list/search page sizes at 500. */
const MAX_PAGE_LIMIT = 500
/** Default seconds to wait on a 429 without rate-limit headers (2s burst window). */
const DEFAULT_RETRY_AFTER_S = 2

function jitter() {
  return Math.floor(Math.random() * 1000)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampLimit(query) {
  if (query?.limit && Number(query.limit) > MAX_PAGE_LIMIT) {
    return { ...query, limit: MAX_PAGE_LIMIT }
  }
  return query
}

/**
 * @param {object} options
 * @param {string} [options.companyDomain] Bare subdomain ("acme") — forms and
 *   locks the base origin https://acme.pipedrive.com (token mode).
 * @param {string} [options.apiDomain] Full origin from the OAuth token
 *   response (e.g. https://acme.pipedrive.com) — used and locked in OAuth mode.
 * @param {string} options.token Personal API token (x-api-token header) or
 *   OAuth access token (Authorization: Bearer) depending on authMode.
 * @param {'token' | 'oauth'} [options.authMode]
 * @param {() => Promise<string>} [options.onRefresh] OAuth-mode callback
 *   invoked once on a 401; returns a fresh access token to retry with.
 * @param {number} [options.timeout]
 * @param {boolean} [options.retry]
 * @param {string} [options.userAgent]
 */
export function createClient({
  companyDomain,
  apiDomain,
  token: initialToken,
  authMode = 'token',
  onRefresh,
  timeout = 30_000,
  retry = true,
  userAgent = 'pdcli',
}) {
  const baseOrigin = apiDomain
    ? new URL(apiDomain).origin
    : companyDomainToBaseOrigin(companyDomain)
  let token = initialToken

  async function request(method, path, { body, query } = {}) {
    const url = new URL(path, baseOrigin)
    if (url.origin !== baseOrigin) {
      throw new CliError(
        `Refusing to send request outside your Pipedrive company host ` +
          `(${baseOrigin}): ${url.origin}`,
        { exitCode: 78 },
      )
    }
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v == null) continue
        if (Array.isArray(v)) {
          url.searchParams.set(k, v.join(','))
        } else {
          url.searchParams.set(k, String(v))
        }
      }
    }

    const maxAttempts = retry ? 3 : 1
    let attempts = 0
    let sawRateLimit = false

    while (attempts < maxAttempts) {
      attempts++

      const headers = {
        'content-type': 'application/json',
        'user-agent': userAgent,
      }
      if (authMode === 'oauth') {
        headers.authorization = `Bearer ${token}`
      } else {
        headers['x-api-token'] = token
      }

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      })

      debug('%s %s → %d', method, path, res.status)

      if (res.status === 429) {
        const wait = Number(
          res.headers.get('x-ratelimit-reset') ||
            res.headers.get('retry-after') ||
            DEFAULT_RETRY_AFTER_S,
        )
        if (!retry) throw new RateLimitError(wait)
        sawRateLimit = true
        debug('rate limited, waiting %ds', wait)
        await sleep(wait * 1000)
        continue
      }

      // OAuth access tokens expire (~1h) — refresh once and retry.
      if (res.status === 401 && onRefresh && attempts === 1) {
        debug('401, attempting OAuth token refresh')
        token = await onRefresh()
        continue
      }

      // Pipedrive escalates persistent rate-limit abuse from 429 to 403 —
      // treat that as a hard stop, never retry into it.
      if (res.status === 403 && sawRateLimit) {
        const text = await res.text()
        const err = ApiError.fromResponse(res.status, text, path)
        err.message += ' (403 after 429: rate-limit escalation — stopping)'
        throw err
      }

      if (res.status >= 500 && attempts < maxAttempts) {
        const delay = Math.min(1000 * 2 ** attempts, 30_000) + jitter()
        debug('server error %d, retrying in %dms', res.status, delay)
        await sleep(delay)
        continue
      }

      if (res.status === 204) return null

      const text = await res.text()

      if (!res.ok) {
        throw ApiError.fromResponse(res.status, text, path)
      }

      return text ? JSON.parse(text) : null
    }

    throw new ServiceUnavailableError()
  }

  /**
   * v2 cursor pagination: cursor/limit → additional_data.next_cursor.
   * @param {string} path
   * @param {object} [query]
   * @returns {AsyncGenerator<object>}
   */
  async function* pageV2(path, query = {}) {
    let cursor
    const baseQuery = clampLimit(query)
    while (true) {
      const envelope = await request('GET', path, {
        query: cursor ? { ...baseQuery, cursor } : baseQuery,
      })
      yield* envelope?.data ?? []
      cursor = envelope?.additional_data?.next_cursor
      if (!cursor) break
    }
  }

  /**
   * v1 offset pagination: start/limit →
   * additional_data.pagination.{more_items_in_collection,next_start}.
   * @param {string} path
   * @param {object} [query]
   * @returns {AsyncGenerator<object>}
   */
  async function* pageV1(path, query = {}) {
    let start
    const baseQuery = clampLimit(query)
    while (true) {
      const envelope = await request('GET', path, {
        query: start != null ? { ...baseQuery, start } : baseQuery,
      })
      yield* envelope?.data ?? []
      const pagination = envelope?.additional_data?.pagination
      if (!pagination?.more_items_in_collection) break
      start = pagination.next_start
    }
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    del: (path, opts) => request('DELETE', path, opts),
    pageV1,
    pageV2,
  }
}
