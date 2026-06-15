import createDebug from 'debug'
import chalk from 'chalk'
import { getAlias } from '../lib/aliases.js'

const debug = createDebug('pd:command-not-found')

const MAX_ALIAS_DEPTH = 10

// Tracks alias names expanded within a single process. The hook re-enters
// itself through oclif's runCommand dispatcher (same module instance), so a
// module-level Set survives across those re-entrant invocations and lets us
// detect cycles before they exhaust the stack/heap. Cleared by the root
// invocation in `finally` so distinct alias runs in one process (e.g. tests,
// or a long-lived embedding) don't false-positive against each other.
const aliasChain = new Set()

export default async function commandNotFound(options) {
  const alias = getAlias(options.id)

  if (alias) {
    // Runaway detection. Two distinct failure modes, reported distinctly:
    // a repeated alias name is a true cycle; a long acyclic chain trips the
    // depth cap (legal but almost certainly a mistake — and the cap is what
    // keeps a missed cycle from exhausting the heap).
    if (aliasChain.has(options.id)) {
      const cycle = [...aliasChain, options.id].join(' -> ')
      aliasChain.clear()
      process.stderr.write(
        `${chalk.red('Error:')} alias cycle detected: ${chalk.yellow(cycle)}\n`,
      )
      process.exit(64)
    }
    if (aliasChain.size >= MAX_ALIAS_DEPTH) {
      const chain = [...aliasChain, options.id].join(' -> ')
      aliasChain.clear()
      process.stderr.write(
        `${chalk.red('Error:')} alias expansion exceeded ${MAX_ALIAS_DEPTH} hops: ${chalk.yellow(chain)}\n`,
      )
      process.exit(64)
    }

    // This invocation owns cleanup only if it started a fresh chain.
    const isRoot = aliasChain.size === 0
    aliasChain.add(options.id)

    debug('expanding alias %s -> %s', options.id, alias)
    const aliasArgv = alias.split(/\s+/).filter(Boolean)
    const fullArgv = [...aliasArgv, ...(options.argv ?? [])]

    let commandId = fullArgv[0]
    let restArgv = fullArgv.slice(1)

    for (let i = 1; i < fullArgv.length; i++) {
      const candidate = fullArgv.slice(0, i + 1).join(':')
      if (options.config.findCommand(candidate)) {
        commandId = candidate
        restArgv = fullArgv.slice(i + 1)
      }
    }

    try {
      await options.config.runCommand(commandId, restArgv)
      process.exit(0)
    } catch (err) {
      debug('alias execution failed: %s', err.message)
      // Map the exit code faithfully. Our CliError carries .exitCode; the oclif
      // ExitError/CLIError that handleError re-throws carry it ONLY on
      // .oclif.exit (parse errors use 2, which maps to the usage code 64).
      // Reading .exitCode alone would collapse every aliased failure to 1 and
      // break the sysexits contract (auth 77, rate-limit 75, watch's gate 8).
      const code =
        err.exitCode ?? (err.oclif?.exit === 2 ? 64 : err.oclif?.exit) ?? 1
      // A CLIError from cmd.error() holds the human message but relies on
      // oclif's top-level handler to print it — which this hook bypasses, so
      // surface it ourselves. An ExitError (code 'EEXIT', thrown by cmd.exit
      // after the JSON envelope is already on stderr) has nothing to add.
      if (err.code !== 'EEXIT' && err.message) {
        process.stderr.write(`${chalk.red('Error:')} ${err.message}\n`)
      }
      process.exit(code)
    } finally {
      if (isRoot) aliasChain.clear()
    }
  }

  debug('command not found: %s', options.id)
  process.stderr.write(
    `${chalk.red('Error:')} ${chalk.yellow(options.id)} is not a pdcli command.\n`,
  )
  process.stderr.write(
    `Run ${chalk.cyan('pdcli help')} for a list of available commands.\n`,
  )
  process.stderr.write(
    `Run ${chalk.cyan('pdcli alias list')} to see configured aliases.\n`,
  )
  process.exit(127)
}
