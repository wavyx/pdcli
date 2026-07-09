import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolveBody } from '../../lib/body.js'
import { outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class FilterUpdateCommand extends BaseCommand {
  static description = 'Update a filter (only provided fields change)'

  static examples = [
    '<%= config.bin %> filter update 5 --name "Renamed filter"',
    '<%= config.bin %> filter update 5 --conditions @conditions.json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'Filter ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ description: 'Filter name' }),
    conditions: Flags.string({
      description:
        'Conditions JSON (a value or @file). Fields are referenced by numeric ' +
        'field_id — run `pdcli filter helpers` for the valid operators.',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(FilterUpdateCommand)

    const body = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.conditions !== undefined) {
      const raw = await resolveBody({ body: flags.conditions })
      try {
        body.conditions = JSON.parse(raw)
      } catch (err) {
        throw new CliError(`--conditions is not valid JSON: ${err.message}`, {
          exitCode: 65,
        })
      }
    }

    if (Object.keys(body).length === 0) {
      throw new CliError(
        'Nothing to update — pass --name and/or --conditions',
        { exitCode: 64 },
      )
    }

    const res = await this.apiClient.put(`/api/v1/filters/${args.id}`, { body })
    await outputRecord(this, res.data)
  }
}
