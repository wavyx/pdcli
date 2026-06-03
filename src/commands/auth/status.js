import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { getToken, isKeychainAvailable } from '../../lib/keychain.js'
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
    const token = await getToken(this.activeProfile)
    const keychainType = isKeychainAvailable() ? 'OS keychain' : 'unavailable'

    this.log(chalk.bold('Auth Status'))
    this.log('')
    this.log(`  Profile:    ${chalk.cyan(this.activeProfile)}`)
    this.log(`  Keychain:   ${keychainType}`)
    this.log(
      `  API host:   ${domain ? companyDomainToBaseOrigin(domain) : chalk.dim('(not set)')}`,
    )

    if (!token) {
      this.log(`  Status:     ${chalk.red('Not authenticated')}`)
      this.log('')
      this.log(`Run ${chalk.cyan('pdcli auth login')} to authenticate.`)
      return
    }

    this.log(`  Token:      ${chalk.green('present')} (keychain)`)

    // Best-effort identity check — network errors are not fatal here.
    if (domain) {
      try {
        const client = createClient({
          companyDomain: domain,
          token,
          retry: false,
          userAgent: `pdcli/${this.config.version}`,
        })
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
}
