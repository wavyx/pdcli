import { Args } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { setAlias } from '../../lib/aliases.js'
import { CliError } from '../../lib/errors.js'

export default class AliasSetCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Create or update an alias'

  static examples = [
    '<%= config.bin %> alias set wd "deal list --status won"',
    '<%= config.bin %> alias set open "deal list --status open --limit 50"',
  ]

  static args = {
    name: Args.string({ required: true, description: 'Alias name' }),
    command: Args.string({ required: true, description: 'Command to alias' }),
  }

  async run() {
    const { args } = await this.parse(AliasSetCommand)

    if (this.config.findCommand(args.name)) {
      throw new CliError(
        `Cannot create alias ${chalk.cyan(args.name)}: it shadows an existing pdcli command.`,
        { exitCode: 64 },
      )
    }

    setAlias(args.name, args.command)
    this.log(
      chalk.green(`Alias set: ${chalk.cyan(args.name)} → ${args.command}`),
    )
  }
}
