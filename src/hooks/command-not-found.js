import createDebug from 'debug'
import chalk from 'chalk'

const debug = createDebug('pd:command-not-found')

export default async function commandNotFound(options) {
  debug('command not found: %s', options.id)
  process.stderr.write(
    `${chalk.red('Error:')} ${chalk.yellow(options.id)} is not a pdcli command.\n`,
  )
  process.stderr.write(
    `Run ${chalk.cyan('pdcli help')} for a list of available commands.\n`,
  )
  process.exit(127)
}
