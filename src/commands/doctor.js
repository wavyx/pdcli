import { Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../base-command.js'
import { getConf, getActiveProfile, getProfileConfig } from '../lib/config.js'
import { getToken, isKeychainAvailable } from '../lib/keychain.js'
import { companyDomainToBaseOrigin } from '../lib/auth.js'
import { CliError } from '../lib/errors.js'

const PASS = chalk.green('✔')
const FAIL = chalk.red('✘')

export default class DoctorCommand extends BaseCommand {
  static skipAuth = true

  static description =
    'Run diagnostic checks on the CLI environment. Exits 78 (EX_CONFIG) when ' +
    'any check fails. --offline skips the network probe — the CI preflight mode.'

  static examples = [
    '<%= config.bin %> doctor',
    '<%= config.bin %> doctor --offline',
    '<%= config.bin %> doctor --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    offline: Flags.boolean({
      description:
        'Skip the API reachability probe (CI preflight mode; zero network egress)',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(DoctorCommand)
    const machine = this.resolveFormat() !== 'table'
    const spinner = machine ? null : ora('Running diagnostics...').start()
    const envToken = Boolean(process.env.PDCLI_API_TOKEN)
    const results = []

    // 1. Config directory accessible
    try {
      getConf()
      results.push({
        check: 'config-dir',
        label: 'Config directory accessible',
        ok: true,
      })
    } catch {
      results.push({
        check: 'config-dir',
        label: 'Config directory accessible',
        ok: false,
        detail: 'Cannot access config store',
      })
    }

    // 2. Keychain available — an env token (PDCLI_API_TOKEN) makes the
    //    keychain optional, so containers/CI pass this check.
    const keychainOk = isKeychainAvailable()
    results.push({
      check: 'keychain',
      label: 'Keychain available',
      ok: keychainOk || envToken,
      detail: keychainOk
        ? undefined
        : envToken
          ? 'env-token mode (keychain not required)'
          : 'OS keychain unavailable; pdcli cannot store credentials',
    })

    // 3. Active profile set
    let profile
    try {
      profile = getActiveProfile()
      results.push({
        check: 'active-profile',
        label: 'Active profile set',
        ok: true,
        detail: profile,
      })
    } catch {
      results.push({
        check: 'active-profile',
        label: 'Active profile set',
        ok: false,
      })
    }

    // 4. Company domain set
    const domain = profile
      ? getProfileConfig(profile, 'company_domain')
      : undefined
    results.push({
      check: 'company-domain',
      label: 'Company domain set',
      ok: Boolean(domain),
      detail: domain ?? 'Run: pdcli auth login',
    })

    // 5. Token present
    if (envToken) {
      results.push({
        check: 'token',
        label: 'API token present',
        ok: true,
        detail: 'source: env',
      })
    } else if (profile) {
      const token = await getToken(profile)
      results.push({
        check: 'token',
        label: 'API token present',
        ok: token !== null,
        detail: token ? undefined : 'Run: pdcli auth login',
      })
    } else {
      results.push({
        check: 'token',
        label: 'API token present',
        ok: false,
        detail: 'No active profile',
      })
    }

    // 6. API reachable (any HTTP response from the company host counts —
    //    a 401 still proves the host resolves and answers). Skipped entirely
    //    with --offline: five checks, no fetch, zero network egress.
    if (!flags.offline) {
      if (domain) {
        try {
          await fetch(`${companyDomainToBaseOrigin(domain)}/api/v1/users/me`, {
            signal: AbortSignal.timeout(5000),
          })
          results.push({
            check: 'api-reachable',
            label: 'API reachable',
            ok: true,
          })
        } catch {
          results.push({
            check: 'api-reachable',
            label: 'API reachable',
            ok: false,
            detail: `Could not reach ${domain}.pipedrive.com`,
          })
        }
      } else {
        results.push({
          check: 'api-reachable',
          label: 'API reachable',
          ok: false,
          detail: 'No company domain configured',
        })
      }
    }

    spinner?.stop()

    if (machine) {
      await this.outputResults(
        results.map(({ check, ok, detail }) => ({
          check,
          status: ok ? 'pass' : 'fail',
          ...(detail !== undefined && { detail }),
        })),
        {},
      )
    } else {
      this.log('')
      this.log(chalk.bold('Pipedrive CLI Diagnostics'))
      this.log('')

      for (const { label, ok, detail } of results) {
        const icon = ok ? PASS : FAIL
        const suffix = detail ? chalk.dim(` (${detail})`) : ''
        this.log(`  ${icon} ${label}${suffix}`)
      }

      this.log('')
    }

    const failed = results.filter((r) => !r.ok).length
    if (failed > 0) {
      throw new CliError(`${failed} check(s) failed`, { exitCode: 78 })
    }
    if (!machine) this.log(chalk.green('All checks passed'))
  }
}
