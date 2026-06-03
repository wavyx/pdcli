import createDebug from 'debug'
import { getToken } from './keychain.js'
import { getProfileConfig } from './config.js'
import { AuthRequiredError, ConfigError } from './errors.js'

const debug = createDebug('pd:auth')

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
  return { companyDomain, token, source }
}

/**
 * Validate a token by fetching the authenticated user.
 * @param {{ get: (path: string) => Promise<{data: object}> }} client
 * @returns {Promise<object>} the Pipedrive user object
 */
export async function validateToken(client) {
  const body = await client.get('/api/v2/users/me')
  return body.data
}
