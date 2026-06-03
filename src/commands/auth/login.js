import { Flags } from '@oclif/core'
import { input, password } from '@inquirer/prompts'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../../base-command.js'
import { normalizeCompanyDomain, validateToken } from '../../lib/auth.js'
import { createClient } from '../../lib/client.js'
import { setToken } from '../../lib/keychain.js'
import { setProfileConfig } from '../../lib/config.js'

export default class LoginCommand extends BaseCommand {
  static skipAuth = true

  static description =
    'Authenticate with Pipedrive using your personal API token'

  static examples = [
    '<%= config.bin %> auth login',
    '<%= config.bin %> auth login --company acme --api-token <token>',
    '<%= config.bin %> auth login --profile work',
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
  }

  async run() {
    const { flags } = await this.parse(LoginCommand)

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
      spinner.stop()
    } catch (err) {
      spinner.stop()
      throw err
    }

    // Token only ever goes to the OS keychain; the domain lives in config.
    await setToken(this.activeProfile, token)
    setProfileConfig(this.activeProfile, 'company_domain', companyDomain)

    this.log(
      chalk.green(
        `Logged in to ${chalk.cyan(`${companyDomain}.pipedrive.com`)} ` +
          `as ${chalk.bold(user.name)} (${user.email})`,
      ),
    )
    this.log(chalk.dim(`Profile: ${this.activeProfile} — token in keychain`))
  }
}
