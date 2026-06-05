import { Args } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { getProfileConfig, deleteProfileConfig } from '../../lib/config.js'

export default class ConfigUnsetCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Remove a config key from the active profile'

  static examples = ['<%= config.bin %> config unset default_output']

  static args = {
    key: Args.string({ required: true, description: 'Config key to remove' }),
  }

  async run() {
    const { args } = await this.parse(ConfigUnsetCommand)

    if (getProfileConfig(this.activeProfile, args.key) === undefined) {
      this.log(
        `${chalk.cyan(args.key)} is not set for profile ${chalk.cyan(this.activeProfile)}`,
      )
      return
    }

    deleteProfileConfig(this.activeProfile, args.key)
    this.log(
      `Removed ${chalk.cyan(args.key)} from profile ${chalk.cyan(this.activeProfile)}`,
    )
  }
}
