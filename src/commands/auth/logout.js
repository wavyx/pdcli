import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { deleteToken, deleteOAuthTokens } from '../../lib/keychain.js'

export default class LogoutCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Log out and remove the stored API token'

  static examples = ['<%= config.bin %> auth logout']

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    await this.parse(LogoutCommand)

    await deleteToken(this.activeProfile)
    await deleteOAuthTokens(this.activeProfile)
    this.log(
      chalk.green(`Logged out of profile ${chalk.cyan(this.activeProfile)}`),
    )
  }
}
