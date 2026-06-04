import { writeFileSync } from 'node:fs'
import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'

export default class FileDownloadCommand extends BaseCommand {
  static description = 'Download a file by ID'

  static examples = [
    '<%= config.bin %> file download 5',
    '<%= config.bin %> file download 5 --out ./report.pdf',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'File ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    out: Flags.string({ description: 'Path to write to (default: file name)' }),
  }

  async run() {
    const { args, flags } = await this.parse(FileDownloadCommand)

    const body = await this.apiClient.get(`/api/v1/files/${args.id}`)
    const { buffer } = await this.apiClient.download(
      `/api/v1/files/${args.id}/download`,
    )
    const bytes = Buffer.from(buffer)
    const out = flags.out ?? body.data.name
    writeFileSync(out, bytes)
    this.log(chalk.green(`Saved ${out} (${bytes.length} bytes)`))
  }
}
