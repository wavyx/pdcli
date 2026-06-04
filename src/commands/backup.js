import { Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import BaseCommand from '../base-command.js'
import { runBackup } from '../lib/backup.js'

export default class BackupCommand extends BaseCommand {
  static description =
    'Export the whole account to a JSON tree (resumable, one file per resource)'

  static examples = [
    '<%= config.bin %> backup',
    '<%= config.bin %> backup --dir ./my-backup',
    '<%= config.bin %> backup --dir ./my-backup --resume',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    dir: Flags.string({
      description: 'Target directory for the export',
      default: 'pipedrive-backup',
    }),
    resume: Flags.boolean({
      description: 'Skip resources already completed in a previous run',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(BackupCommand)

    const spinner = ora('Starting backup...').start()
    let summary
    try {
      summary = await runBackup(this.apiClient, flags.dir, {
        resume: flags.resume,
        onProgress: (resource, count) => {
          spinner.text = `Exported ${resource} (${count})`
        },
      })
    } finally {
      spinner.stop()
    }

    this.log(
      chalk.green(
        `Backup complete: ${summary.exported}/${summary.total} resources ` +
          `exported to ${chalk.cyan(flags.dir)}` +
          (summary.skipped ? chalk.dim(` (${summary.skipped} skipped)`) : ''),
      ),
    )
  }
}
