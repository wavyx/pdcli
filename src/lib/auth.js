import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import createDebug from 'debug'
import open from 'open'
import { getToken, getOAuthTokens, setOAuthTokens } from './keychain.js'
import { getProfileConfig } from './config.js'
import { ApiError, AuthRequiredError, CliError, ConfigError } from './errors.js'

const debug = createDebug('pd:auth')

const AUTH_URL = 'https://oauth.pipedrive.com/oauth/authorize'
const TOKEN_URL = 'https://oauth.pipedrive.com/oauth/token'
const REFRESH_BUFFER_MS = 5 * 60 * 1000
const REDIRECT_PORT = 9999

/**
 * Normalize user input ("acme", "acme.pipedrive.com",
 * "https://acme.pipedrive.com/") to the bare company subdomain.
 * @param {string} input
 * @returns {string}
 */
export function normalizeCompanyDomain(input) {
  return input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\.pipedrive\.com\/?.*$/, '')
}

/**
 * @param {string} companyDomain
 * @returns {string}
 */
export function companyDomainToBaseOrigin(companyDomain) {
  return `https://${companyDomain}.pipedrive.com`
}

/**
 * @typedef {object} ResolvedCredentials
 * @property {string} companyDomain
 * @property {string} token
 * @property {'flags' | 'env' | 'profile'} source Where the token came from.
 */

/**
 * Resolve company domain and API token independently, each with
 * flags → env → profile-config/keychain precedence.
 * @param {object} options
 * @param {object} [options.flags]
 * @param {string} [options.flags.company]
 * @param {string} [options.flags."api-token"]
 * @param {string} [options.profile]
 * @returns {Promise<ResolvedCredentials>}
 */
export async function resolveCredentials({ flags, profile } = {}) {
  // Explicit token via flags/env always wins. Otherwise a profile in OAuth
  // mode resolves to its (auto-refreshed) access token + api_domain.
  const explicitToken = flags?.['api-token'] || process.env.PDCLI_API_TOKEN
  if (
    !explicitToken &&
    profile &&
    getProfileConfig(profile, 'auth_mode') === 'oauth'
  ) {
    const access = await getValidOAuthAccess(profile)
    if (!access) throw new AuthRequiredError()
    debug('resolved OAuth credentials for %s', access.apiDomain)
    return {
      mode: 'oauth',
      apiDomain: access.apiDomain,
      token: access.accessToken,
      oauth: access,
      source: 'profile',
    }
  }

  let companyDomain
  if (flags?.company) {
    companyDomain = flags.company
  } else if (process.env.PDCLI_COMPANY_DOMAIN) {
    companyDomain = process.env.PDCLI_COMPANY_DOMAIN
  } else if (profile) {
    companyDomain = getProfileConfig(profile, 'company_domain')
  }

  if (!companyDomain) {
    throw new ConfigError(
      'No company domain configured. Run: pdcli auth login ' +
        '(or set PDCLI_COMPANY_DOMAIN)',
    )
  }
  companyDomain = normalizeCompanyDomain(companyDomain)

  let token
  let source
  if (flags?.['api-token']) {
    token = flags['api-token']
    source = 'flags'
  } else if (process.env.PDCLI_API_TOKEN) {
    token = process.env.PDCLI_API_TOKEN
    source = 'env'
  } else if (profile) {
    token = await getToken(profile)
    source = 'profile'
  }

  if (!token) {
    throw new AuthRequiredError()
  }

  debug('resolved credentials for %s (token from %s)', companyDomain, source)
  return { mode: 'token', companyDomain, token, source }
}

/**
 * Exchange an authorization code for tokens. Pipedrive authenticates the
 * token endpoint with HTTP Basic (client_id:client_secret) and returns the
 * account's api_domain, which becomes the API base URL.
 * @param {{ code: string, clientId: string, clientSecret: string, redirectUri: string }} options
 */
export async function exchangeCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
}) {
  return tokenRequest(
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
    { clientId, clientSecret },
  )
}

/**
 * @param {{ refreshToken: string, clientId: string, clientSecret: string }} options
 */
export async function refreshAccessToken({
  refreshToken,
  clientId,
  clientSecret,
}) {
  debug('refreshing access token')
  try {
    return await tokenRequest(
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      { clientId, clientSecret },
    )
  } catch (err) {
    // A rejected refresh (expired/revoked refresh token → 400 invalid_grant,
    // or 401 invalid_client) is an auth problem, not bad data — surface it as
    // 77 with re-auth guidance so an agent keyed to 77 re-authenticates.
    if (
      err instanceof ApiError &&
      (err.statusCode === 400 || err.statusCode === 401)
    ) {
      throw new CliError(
        `OAuth token refresh failed (${err.message}). Run: pdcli auth login`,
        { exitCode: 77, cause: err },
      )
    }
    throw err
  }
}

async function tokenRequest(params, { clientId, clientSecret }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })

  const body = await res.json()
  if (!res.ok) {
    throw ApiError.fromResponse(res.status, JSON.stringify(body), TOKEN_URL)
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
    apiDomain: body.api_domain,
  }
}

/**
 * Browser-based OAuth authorization-code flow via a local loopback server.
 * @param {object} options
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {number} [options.timeout]
 * @param {number} [options.port] Loopback callback port (must match the
 *   callback URL registered in the Pipedrive Developer Hub app). Default 9999.
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresIn: number, apiDomain: string}>}
 */
export function authorizationCodeFlow({
  clientId,
  clientSecret,
  timeout = 120_000,
  port = REDIRECT_PORT,
}) {
  return new Promise((resolve, reject) => {
    const state = randomBytes(16).toString('hex')
    let timer

    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`)
      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end()
        return
      }

      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')

      if (returnedState !== state) {
        res.writeHead(400, { 'content-type': 'text/html' })
        res.end(
          '<h2>Authentication failed: state mismatch (possible CSRF attack)</h2>',
        )
        clearTimeout(timer)
        server.close()
        reject(
          new CliError('OAuth state mismatch — possible CSRF attack', {
            exitCode: 77,
          }),
        )
        return
      }

      if (!code) {
        res.writeHead(400, { 'content-type': 'text/html' })
        res.end(
          '<h2>Authentication failed: no authorization code received</h2>',
        )
        clearTimeout(timer)
        server.close()
        reject(new CliError('No authorization code received', { exitCode: 77 }))
        return
      }

      try {
        const tokens = await exchangeCode({
          code,
          clientId,
          clientSecret,
          redirectUri: `http://127.0.0.1:${server.address().port}/callback`,
        })
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<h2>Authenticated! You can close this window.</h2>')
        clearTimeout(timer)
        server.close()
        resolve(tokens)
      } catch (err) {
        res.writeHead(500, { 'content-type': 'text/html' })
        res.end(`<h2>Authentication failed: ${err.message}</h2>`)
        clearTimeout(timer)
        server.close()
        reject(err)
      }
    })

    server.on('error', (err) => {
      clearTimeout(timer)
      reject(
        new CliError(
          `Cannot start the local callback server on port ${port}: ${err.message}. ` +
            'If the port is in use, close whatever is using it and run `pdcli auth login --oauth` again.',
          { exitCode: 78 },
        ),
      )
    })

    server.listen(port, '127.0.0.1', () => {
      const boundPort = server.address().port
      const redirectUri = `http://127.0.0.1:${boundPort}/callback`
      const authUrl = `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`
      debug('opening browser for auth: %s', authUrl)
      open(authUrl)
    })

    timer = setTimeout(() => {
      server.close()
      reject(
        new CliError(
          `Authentication timed out after ${timeout / 1000}s. Try again.`,
          { exitCode: 77 },
        ),
      )
    }, timeout)
  })
}

/**
 * Return a valid OAuth access token for the profile, transparently
 * refreshing (and persisting) when within the expiry buffer.
 * @param {string} profile
 * @returns {Promise<import('./keychain.js').OAuthTokens | null>}
 */
export async function getValidOAuthAccess(profile) {
  const tokens = await getOAuthTokens(profile)
  if (!tokens) return null

  const now = Date.now()
  if (tokens.expiresAt - now > REFRESH_BUFFER_MS) {
    return tokens
  }

  const refreshed = await refreshAccessToken({
    refreshToken: tokens.refreshToken,
    clientId: tokens.clientId,
    clientSecret: tokens.clientSecret,
  })
  const updated = {
    ...tokens,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: now + refreshed.expiresIn * 1000,
  }
  await setOAuthTokens(profile, updated)
  return updated
}

/**
 * Validate a token by fetching the authenticated user.
 * Note: the Users API has no v2 equivalent (June 2026) — /api/v2/users/me
 * 404s into the web app's HTML page, so this must stay on v1.
 * @param {{ get: (path: string) => Promise<{data: object}> }} client
 * @returns {Promise<object>} the Pipedrive user object
 */
export async function validateToken(client) {
  const body = await client.get('/api/v1/users/me')
  return body.data
}
