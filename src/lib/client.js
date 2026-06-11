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

    return transport(method, url, {
      path,
      makeBody: body ? () => JSON.stringify(body) : undefined,
      extraHeaders: { 'content-type': 'application/json' },
    })
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

  function lockedUrl(path) {
    const url = new URL(path, baseOrigin)
    if (url.origin !== baseOrigin) {
      throw new CliError(
        `Refusing to send request outside your Pipedrive company host ` +
          `(${baseOrigin}): ${url.origin}`,
        { exitCode: 78 },
      )
    }
    return url
  }

  function authHeaders() {
    return authMode === 'oauth'
      ? { authorization: `Bearer ${token}`, 'user-agent': userAgent }
      : { 'x-api-token': token, 'user-agent': userAgent }
  }

  /**
   * Shared transport: EVERY HTTP path (JSON, form, multipart, binary) goes
   * through the same 429 backoff (x-ratelimit-reset → Retry-After → default),
   * 429→403 escalation hard stop, 5xx retry, OAuth refresh-once, and error
   * mapping. `makeBody` is invoked per attempt — FormData and friends are
   * rebuilt rather than reused across retries.
   * @param {string} method
   * @param {URL} url
   * @param {{ path: string, makeBody?: () => any,
   *   extraHeaders?: Record<string, string>, binary?: boolean }} options
   */
  async function transport(
    method,
    url,
    { path, makeBody, extraHeaders = {}, binary = false },
  ) {
    const maxAttempts = retry ? 3 : 1
    let attempts = 0
    let sawRateLimit = false
    let refreshed = false

    while (attempts < maxAttempts) {
      attempts++

      const res = await fetch(url, {
        method,
        headers: { ...authHeaders(), ...extraHeaders },
        body: makeBody ? makeBody() : undefined,
        signal: AbortSignal.timeout(timeout),
      })

      debug('%s %s → %d', method, path, res.status)

      if (res.status === 429) {
        // Daily-budget exhaustion has no useful reset window — backoff would
        // stall until the daily reset. Fail fast with an actionable message.
        // The live API reports the token budget as
        // x-daily-ratelimit-token-remaining (verified on the sandbox);
        // x-daily-requests-left is the older POST/PUT fair-use header.
        const dailyRemaining =
          res.headers.get('x-daily-ratelimit-token-remaining') ??
          res.headers.get('x-daily-requests-left')
        if (dailyRemaining === '0') {
          const err = new RateLimitError(0)
          err.message =
            'Daily API token budget exhausted — resets at midnight server ' +
            'time (UTC-based; may differ from your local timezone)'
          throw err
        }
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

      // Surface the remaining daily budget under --verbose (DEBUG=pd:*).
      const dailyLeft = res.headers.get('x-daily-ratelimit-token-remaining')
      if (dailyLeft != null) {
        debug(
          'daily token budget: %s remaining of %s',
          dailyLeft,
          res.headers.get('x-daily-ratelimit-token-limit') ?? '?',
        )
      }

      // OAuth access tokens expire (~1h) — refresh once and retry. Gate on a
      // dedicated flag, NOT attempts===1: a 429 backoff can consume the early
      // attempts, so the expiring-token 401 may not arrive until later. The
      // refresh round is free (attempts--) so it never eats the retry budget.
      if (res.status === 401 && onRefresh && !refreshed) {
        debug('401, attempting OAuth token refresh')
        refreshed = true
        token = await onRefresh()
        attempts--
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

      // Binary callers always get the {buffer, contentType} shape — a 204
      // yields an empty buffer rather than null (pre-unification parity;
      // file/download destructures the result).
      if (binary) {
        if (!res.ok) {
          throw ApiError.fromResponse(res.status, await res.text(), path)
        }
        return {
          buffer: await res.arrayBuffer(),
          contentType: res.headers.get('content-type'),
        }
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
   * Download a binary resource (e.g. /api/v1/files/:id/download).
   * @param {string} path
   * @returns {Promise<{buffer: ArrayBuffer, contentType: string | null}>}
   */
  async function download(path) {
    return transport('GET', lockedUrl(path), { path, binary: true })
  }

  /**
   * POST multipart/form-data (file uploads — v1 files API).
   * @param {string} path
   * @param {{ file: { name: string, data: Buffer | Uint8Array }, fields?: Record<string, unknown> }} options
   */
  async function postMultipart(path, { file, fields = {} }) {
    // fetch sets the multipart boundary itself — no content-type override.
    const makeBody = () => {
      const form = new FormData()
      form.set('file', new Blob([file.data]), file.name)
      for (const [k, v] of Object.entries(fields)) {
        if (v != null) form.set(k, String(v))
      }
      return form
    }
    return transport('POST', lockedUrl(path), { path, makeBody })
  }

  /**
   * POST application/x-www-form-urlencoded (v1 form endpoints, e.g.
   * /api/v1/files/remoteLink — JSON is not accepted there).
   * @param {string} path
   * @param {Record<string, unknown>} fields Null/undefined values are omitted.
   */
  async function postForm(path, fields = {}) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(fields)) {
      if (v != null) params.set(k, String(v))
    }
    return transport('POST', lockedUrl(path), {
      path,
      makeBody: () => params.toString(),
      extraHeaders: { 'content-type': 'application/x-www-form-urlencoded' },
    })
  }

  /**
   * PUT application/x-www-form-urlencoded (v1 form endpoints, e.g.
   * /api/v1/files/:id — JSON is not accepted there).
   * @param {string} path
   * @param {Record<string, unknown>} fields Null/undefined values are omitted.
   */
  async function putForm(path, fields = {}) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(fields)) {
      if (v != null) params.set(k, String(v))
    }
    return transport('PUT', lockedUrl(path), {
      path,
      makeBody: () => params.toString(),
      extraHeaders: { 'content-type': 'application/x-www-form-urlencoded' },
    })
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    del: (path, opts) => request('DELETE', path, opts),
    download,
    postMultipart,
    postForm,
    putForm,
    pageV1,
    pageV2,
  }
}
