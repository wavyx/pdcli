import { Args } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { setAlias, getAliases } from '../../lib/aliases.js'
import { CliError } from '../../lib/errors.js'

const MAX_ALIAS_HOPS = 10

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
    const name = args.name

    // A dotted name corrupts conf's dotted-path store/read (the value would
    // be written nested and never round-trip back as a flat alias key).
    if (name.includes('.')) {
      throw new CliError(
        `Cannot create alias ${chalk.cyan(name)}: alias names may not contain '.' (dots).`,
        { exitCode: 64 },
      )
    }

    if (this.config.findCommand(name)) {
      throw new CliError(
        `Cannot create alias ${chalk.cyan(name)}: it shadows an existing pdcli command.`,
        { exitCode: 64 },
      )
    }

    // A name matching a topic (e.g. `deal`) is reachable by oclif's dispatcher
    // before command-not-found fires, so the alias would never run.
    if (this.config.findTopic(name)) {
      throw new CliError(
        `Cannot create alias ${chalk.cyan(name)}: it shadows an existing pdcli topic.`,
        { exitCode: 64 },
      )
    }

    const firstToken = args.command.split(/\s+/).filter(Boolean)[0]

    // Direct self-reference: `alias set x "x ..."` loops immediately.
    if (firstToken === name) {
      throw new CliError(
        `Cannot create alias ${chalk.cyan(name)}: the command refers to itself.`,
        { exitCode: 64 },
      )
    }

    // Transitive cycle: walk the existing alias graph from firstToken. If it
    // leads back to `name` within MAX_ALIAS_HOPS, expanding this alias would
    // re-enter forever.
    const aliases = getAliases() ?? {}
    const seen = new Set([name])
    let token = firstToken
    for (let hop = 0; hop < MAX_ALIAS_HOPS; hop++) {
      if (token === name) {
        const cycle = [...seen, name].join(' -> ')
        throw new CliError(
          `Cannot create alias ${chalk.cyan(name)}: it forms a cycle (${cycle}).`,
          { exitCode: 64 },
        )
      }
      const next = aliases[token]
      if (!next) break // token is not an alias — chain terminates safely
      if (seen.has(token)) break // pre-existing cycle not involving `name`
      seen.add(token)
      token = next.split(/\s+/).filter(Boolean)[0]
    }

    // Aliases run with full credentials — flag ones that hide destructive
    // operations so a shared config can't smuggle in a silent delete.
    if (/\b(DELETE|delete|merge)\b/.test(args.command)) {
      process.stderr.write(
        `${chalk.yellow('Warning:')} this alias wraps a destructive command — ` +
          `it will run without additional confirmation prompts beyond the ` +
          `command's own.\n`,
      )
    }

    setAlias(name, args.command)
    this.log(chalk.green(`Alias set: ${chalk.cyan(name)} → ${args.command}`))
  }
}
