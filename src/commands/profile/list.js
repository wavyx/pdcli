import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { getAllProfiles, getActiveProfile } from '../../lib/config.js'
import { getToken } from '../../lib/keychain.js'

export default class ProfileListCommand extends BaseCommand {
  static skipAuth = true

  static description = 'List all configured profiles'

  static examples = ['<%= config.bin %> profile list']

  async run() {
    const profiles = getAllProfiles()
    const active = getActiveProfile()
    const names = new Set(Object.keys(profiles))

    const activeToken = await getToken(active)
    if (activeToken) names.add(active)

    if (names.size === 0) {
      this.log('No profiles configured. Run: pdcli auth login')
      return
    }

    for (const name of names) {
      const token = await getToken(name)
      const status = token ? chalk.dim(' (authenticated)') : ''
      if (name === active) {
        this.log(chalk.green(`* ${name}`) + status)
      } else {
        this.log(`  ${name}${status}`)
      }
    }
  }
}
