import chalk from 'chalk'
import BaseCommand from '../base-command.js'
import { getProfileConfig } from '../lib/config.js'
import { companyDomainToBaseOrigin } from '../lib/auth.js'

export default class VersionCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Show CLI version and environment info'

  static examples = ['<%= config.bin %> version']

  async run() {
    const domain = getProfileConfig(this.activeProfile, 'company_domain')
    const apiBase = domain
      ? companyDomainToBaseOrigin(domain)
      : chalk.dim('(not set)')

    this.log(`${chalk.bold('pdcli')} ${chalk.cyan(this.config.version)}`)
    this.log(`Node:     ${process.version}`)
    this.log(`API base: ${apiBase}`)
    this.log(`Platform: ${process.platform}-${process.arch}`)
  }
}
