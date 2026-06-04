import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import {
  getToken,
  getOAuthTokens,
  isKeychainAvailable,
} from '../../lib/keychain.js'
import { getProfileConfig } from '../../lib/config.js'
import { companyDomainToBaseOrigin, validateToken } from '../../lib/auth.js'
import { createClient } from '../../lib/client.js'

export default class StatusCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Show current authentication status'

  static examples = ['<%= config.bin %> auth status']

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    await this.parse(StatusCommand)

    const domain = getProfileConfig(this.activeProfile, 'company_domain')
    const authMode = getProfileConfig(this.activeProfile, 'auth_mode')
    const keychainType = isKeychainAvailable() ? 'OS keychain' : 'unavailable'

    this.log(chalk.bold('Auth Status'))
    this.log('')
    this.log(`  Profile:    ${chalk.cyan(this.activeProfile)}`)
    this.log(`  Keychain:   ${keychainType}`)

    if (authMode === 'oauth') {
      await this.#oauthStatus()
      return
    }

    this.log(
      `  API host:   ${domain ? companyDomainToBaseOrigin(domain) : chalk.dim('(not set)')}`,
    )

    const token = await getToken(this.activeProfile)
    if (!token) {
      this.log(`  Status:     ${chalk.red('Not authenticated')}`)
      this.log('')
      this.log(`Run ${chalk.cyan('pdcli auth login')} to authenticate.`)
      return
    }

    this.log(`  Token:      ${chalk.green('present')} (keychain)`)

    // Best-effort identity check — network errors are not fatal here.
    if (domain) {
      await this.#showIdentity(
        createClient({
          companyDomain: domain,
          token,
          retry: false,
          userAgent: `pdcli/${this.config.version}`,
        }),
      )
    }
  }

  async #oauthStatus() {
    const tokens = await getOAuthTokens(this.activeProfile)

    if (!tokens) {
      this.log(`  Auth mode:  OAuth`)
      this.log(`  Status:     ${chalk.red('Not authenticated')}`)
      this.log('')
      this.log(`Run ${chalk.cyan('pdcli auth login --oauth')} to authenticate.`)
      return
    }

    const remainingMin = Math.max(
      0,
      Math.round((tokens.expiresAt - Date.now()) / 60_000),
    )
    this.log(`  API host:   ${tokens.apiDomain}`)
    this.log(`  Auth mode:  OAuth (auto-refresh)`)
    this.log(
      `  Token:      ${chalk.green('present')} (expires in ${remainingMin}m)`,
    )

    await this.#showIdentity(
      createClient({
        apiDomain: tokens.apiDomain,
        token: tokens.accessToken,
        authMode: 'oauth',
        retry: false,
        userAgent: `pdcli/${this.config.version}`,
      }),
    )
  }

  async #showIdentity(client) {
    try {
      const user = await validateToken(client)
      this.log('')
      this.log(chalk.bold('  Authenticated User'))
      if (user.name) this.log(`  Name:       ${user.name}`)
      if (user.email) this.log(`  Email:      ${user.email}`)
    } catch {
      // Silently ignore — identity display is best-effort
    }
  }
}
