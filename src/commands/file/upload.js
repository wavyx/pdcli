import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class FileUploadCommand extends BaseCommand {
  static description = 'Upload a file'

  static examples = [
    '<%= config.bin %> file upload ./report.pdf',
    '<%= config.bin %> file upload ./report.pdf --deal 42',
  ]

  static args = {
    path: Args.string({ required: true, description: 'Path to the file' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    deal: Flags.integer({ description: 'Associate with a deal ID' }),
    person: Flags.integer({ description: 'Associate with a person ID' }),
    org: Flags.integer({ description: 'Associate with an organization ID' }),
  }

  async run() {
    const { args, flags } = await this.parse(FileUploadCommand)

    const data = readFileSync(args.path)
    const name = basename(args.path)

    const res = await this.apiClient.postMultipart('/api/v1/files', {
      file: { name, data },
      fields: {
        deal_id: flags.deal,
        person_id: flags.person,
        org_id: flags.org,
      },
    })
    await outputRecord(this, res.data)
  }
}
