import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class FileUpdateCommand extends BaseCommand {
  static description = 'Update a file name and/or description'

  static examples = [
    '<%= config.bin %> file update 5 --name report.pdf',
    '<%= config.bin %> file update 5 --description "Signed contract"',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'File ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ description: 'The visible name of the file' }),
    description: Flags.string({ description: 'The description of the file' }),
  }

  async run() {
    const { args, flags } = await this.parse(FileUpdateCommand)

    if (flags.name == null && flags.description == null) {
      throw new CliError('Pass at least one of --name or --description', {
        exitCode: 64,
      })
    }

    const res = await this.apiClient.putForm(`/api/v1/files/${args.id}`, {
      name: flags.name,
      description: flags.description,
    })
    await outputRecord(this, res.data)
  }
}
