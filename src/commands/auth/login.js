import { Flags } from '@oclif/core'
import { input, password } from '@inquirer/prompts'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../../base-command.js'
import {
  authorizationCodeFlow,
  normalizeCompanyDomain,
  validateToken,
} from '../../lib/auth.js'
import { createClient } from '../../lib/client.js'
import { setToken, setOAuthTokens } from '../../lib/keychain.js'
import { setProfileConfig } from '../../lib/config.js'

export default class LoginCommand extends BaseCommand {
  static skipAuth = true

  static description =
    'Authenticate with Pipedrive (personal API token, or OAuth with --oauth)'

  static examples = [
    '<%= config.bin %> auth login',
    '<%= config.bin %> auth login --company acme --api-token <token>',
    '<%= config.bin %> auth login --oauth',
    '<%= config.bin %> auth login --oauth --client-id <id> --client-secret <secret>',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    company: Flags.string({
      description:
        'Company domain ("acme" from acme.pipedrive.com — full URL accepted)',
    }),
    'api-token': Flags.string({
      description:
        'Personal API token (app.pipedrive.com/settings/api). Prefer the prompt or env so the token stays out of shell history',
    }),
    oauth: Flags.boolean({
      description:
        'Use OAuth 2.0 via your own Developer Hub app (browser flow)',
      default: false,
    }),
    'client-id': Flags.string({
      description: 'OAuth app client ID (--oauth; env PDCLI_CLIENT_ID)',
      dependsOn: ['oauth'],
    }),
    'client-secret': Flags.string({
      description: 'OAuth app client secret (--oauth; env PDCLI_CLIENT_SECRET)',
      dependsOn: ['oauth'],
    }),
    port: Flags.integer({
      description:
        "OAuth callback port — must match the app's registered callback URL (--oauth)",
      default: 9999,
      dependsOn: ['oauth'],
    }),
  }

  async run() {
    const { flags } = await this.parse(LoginCommand)

    if (flags.oauth) {
      await this.#oauthLogin(flags)
      return
    }

    await this.#tokenLogin(flags)
  }

  async #tokenLogin(flags) {
    const rawDomain =
      flags.company ??
      (await input({
        message: 'Company domain (e.g. "acme" from acme.pipedrive.com):',
      }))
    const companyDomain = normalizeCompanyDomain(rawDomain)

    const token =
      flags['api-token'] ??
      (await password({
        message: 'API token (app.pipedrive.com/settings/api):',
        mask: true,
      }))

    const spinner = ora('Validating token...').start()
    let user
    try {
      const client = createClient({
        companyDomain,
        token,
        userAgent: `pdcli/${this.config.version}`,
      })
      user = await validateToken(client)
    } finally {
      spinner.stop()
    }

    // Token only ever goes to the OS keychain; the domain lives in config.
    await setToken(this.activeProfile, token)
    setProfileConfig(this.activeProfile, 'company_domain', companyDomain)
    setProfileConfig(this.activeProfile, 'auth_mode', 'token')

    this.log(
      chalk.green(
        `Logged in to ${chalk.cyan(`${companyDomain}.pipedrive.com`)} ` +
          `as ${chalk.bold(user.name)} (${user.email})`,
      ),
    )
    this.log(chalk.dim(`Profile: ${this.activeProfile} — token in keychain`))
  }

  async #oauthLogin(flags) {
    const clientId =
      flags['client-id'] ??
      process.env.PDCLI_CLIENT_ID ??
      (await input({
        message: 'OAuth client ID (Developer Hub app):',
      }))
    const clientSecret =
      flags['client-secret'] ??
      process.env.PDCLI_CLIENT_SECRET ??
      (await password({
        message: 'OAuth client secret:',
        mask: true,
      }))

    this.log('Opening your browser to authorize pdcli...')
    const tokens = await authorizationCodeFlow({
      clientId,
      clientSecret,
      port: flags.port,
    })

    const spinner = ora('Validating access token...').start()
    let user
    try {
      const client = createClient({
        apiDomain: tokens.apiDomain,
        token: tokens.accessToken,
        authMode: 'oauth',
        userAgent: `pdcli/${this.config.version}`,
      })
      user = await validateToken(client)
    } finally {
      spinner.stop()
    }

    // The whole bundle — including the client secret — lives in the
    // keychain. Config only records the mode and display domain.
    await setOAuthTokens(this.activeProfile, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      apiDomain: tokens.apiDomain,
      clientId,
      clientSecret,
    })
    const companyDomain = normalizeCompanyDomain(tokens.apiDomain)
    setProfileConfig(this.activeProfile, 'auth_mode', 'oauth')
    setProfileConfig(this.activeProfile, 'company_domain', companyDomain)

    this.log(
      chalk.green(
        `Logged in via OAuth to ${chalk.cyan(tokens.apiDomain)} ` +
          `as ${chalk.bold(user.name)} (${user.email})`,
      ),
    )
    this.log(
      chalk.dim(
        `Profile: ${this.activeProfile} — tokens in keychain, auto-refresh on expiry`,
      ),
    )
  }
}
