import { Command, Flags } from '@oclif/core'
import { formatOutput } from './lib/output/index.js'
import { loadConfig } from './lib/config.js'
import { resolveCredentials, refreshAccessToken } from './lib/auth.js'
import { setOAuthTokens } from './lib/keychain.js'
import { createClient } from './lib/client.js'
import { handleError } from './lib/errors.js'

export default class BaseCommand extends Command {
  static baseFlags = {
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      helpGroup: 'GLOBAL',
      options: ['table', 'json'],
    }),
    profile: Flags.string({
      description: 'Named auth profile to use',
      helpGroup: 'GLOBAL',
      env: 'PDCLI_PROFILE',
    }),
    'no-color': Flags.boolean({
      description: 'Disable color output',
      helpGroup: 'GLOBAL',
    }),
    verbose: Flags.boolean({
      description: 'Show detailed API request/response on errors',
      helpGroup: 'GLOBAL',
      default: false,
    }),
    'no-retry': Flags.boolean({
      description: 'Disable automatic retry on rate limits and 5xx errors',
      helpGroup: 'GLOBAL',
      default: false,
    }),
    timeout: Flags.integer({
      description: 'Request timeout in milliseconds',
      helpGroup: 'GLOBAL',
    }),
    limit: Flags.integer({
      description: 'Maximum number of items to return (lists)',
      helpGroup: 'GLOBAL',
    }),
  }

  /** @type {string} */
  activeProfile
  /** @type {ReturnType<import('./lib/client.js').createClient>} */
  apiClient

  async init() {
    await super.init()
    const { flags } = await this.parse(/** @type {any} */ (this.constructor))
    this.flags = flags

    if (flags['no-color'] || process.env.NO_COLOR) {
      process.env.FORCE_COLOR = '0'
    }

    if (flags.verbose) {
      process.env.DEBUG = process.env.DEBUG
        ? `${process.env.DEBUG},pd:*`
        : 'pd:*'
    }

    const config = loadConfig(flags.profile)
    this.activeProfile = config.activeProfile

    if (this.constructor.skipAuth) return

    const creds = await resolveCredentials({
      flags,
      profile: this.activeProfile,
    })

    const common = {
      retry: !flags['no-retry'],
      timeout: flags.timeout,
      userAgent: `pdcli/${this.config.version}`,
    }

    if (creds.mode === 'oauth') {
      this.apiClient = createClient({
        ...common,
        apiDomain: creds.apiDomain,
        token: creds.token,
        authMode: 'oauth',
        onRefresh: async () => {
          const refreshed = await refreshAccessToken({
            refreshToken: creds.oauth.refreshToken,
            clientId: creds.oauth.clientId,
            clientSecret: creds.oauth.clientSecret,
          })
          await setOAuthTokens(this.activeProfile, {
            ...creds.oauth,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: Date.now() + refreshed.expiresIn * 1000,
          })
          return refreshed.accessToken
        },
      })
      return
    }

    this.apiClient = createClient({
      ...common,
      companyDomain: creds.companyDomain,
      token: creds.token,
    })
  }

  /** Effective output format: explicit flag, else table in a TTY, json piped. */
  resolveFormat() {
    return this.flags.output ?? (process.stdout.isTTY ? 'table' : 'json')
  }

  /**
   * @param {object | object[]} data
   * @param {Record<string, import('./lib/output/table.js').Column>} columns
   */
  async outputResults(data, columns) {
    formatOutput(data, columns, this.resolveFormat(), this)
  }

  async catch(err) {
    handleError(err, this)
  }
}
