import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../base-command.js'
import { getConf, getActiveProfile, getProfileConfig } from '../lib/config.js'
import { getToken, isKeychainAvailable } from '../lib/keychain.js'
import { companyDomainToBaseOrigin } from '../lib/auth.js'

const PASS = chalk.green('✔')
const FAIL = chalk.red('✘')

export default class DoctorCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Run diagnostic checks on the CLI environment'

  static examples = ['<%= config.bin %> doctor']

  async run() {
    const spinner = ora('Running diagnostics...').start()
    const results = []

    // 1. Config directory accessible
    try {
      getConf()
      results.push({ label: 'Config directory accessible', ok: true })
    } catch {
      results.push({
        label: 'Config directory accessible',
        ok: false,
        detail: 'Cannot access config store',
      })
    }

    // 2. Keychain available
    const keychainOk = isKeychainAvailable()
    results.push({
      label: 'Keychain available',
      ok: keychainOk,
      detail: keychainOk
        ? undefined
        : 'OS keychain unavailable; pdcli cannot store credentials',
    })

    // 3. Active profile set
    let profile
    try {
      profile = getActiveProfile()
      results.push({ label: 'Active profile set', ok: true, detail: profile })
    } catch {
      results.push({ label: 'Active profile set', ok: false })
    }

    // 4. Company domain set
    const domain = profile
      ? getProfileConfig(profile, 'company_domain')
      : undefined
    results.push({
      label: 'Company domain set',
      ok: Boolean(domain),
      detail: domain ?? 'Run: pdcli auth login',
    })

    // 5. Token present
    if (profile) {
      const token = await getToken(profile)
      results.push({
        label: 'API token present',
        ok: token !== null,
        detail: token ? undefined : 'Run: pdcli auth login',
      })
    } else {
      results.push({
        label: 'API token present',
        ok: false,
        detail: 'No active profile',
      })
    }

    // 6. API reachable (any HTTP response from the company host counts —
    //    a 401 still proves the host resolves and answers)
    if (domain) {
      try {
        await fetch(`${companyDomainToBaseOrigin(domain)}/api/v2/users/me`, {
          signal: AbortSignal.timeout(5000),
        })
        results.push({ label: 'API reachable', ok: true })
      } catch {
        results.push({
          label: 'API reachable',
          ok: false,
          detail: `Could not reach ${domain}.pipedrive.com`,
        })
      }
    } else {
      results.push({
        label: 'API reachable',
        ok: false,
        detail: 'No company domain configured',
      })
    }

    spinner.stop()

    this.log('')
    this.log(chalk.bold('Pipedrive CLI Diagnostics'))
    this.log('')

    for (const { label, ok, detail } of results) {
      const icon = ok ? PASS : FAIL
      const suffix = detail ? chalk.dim(` (${detail})`) : ''
      this.log(`  ${icon} ${label}${suffix}`)
    }

    this.log('')

    const failed = results.filter((r) => !r.ok).length
    if (failed > 0) {
      this.log(chalk.yellow(`${failed} check${failed > 1 ? 's' : ''} failed`))
    } else {
      this.log(chalk.green('All checks passed'))
    }
  }
}
