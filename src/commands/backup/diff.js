import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { loadBackup } from '../../lib/backup.js'
import { diffBackups } from '../../lib/backup-diff.js'
import { CliError } from '../../lib/errors.js'

export default class BackupDiffCommand extends BaseCommand {
  // Purely local: reads two backup directories, makes ZERO API calls, so it
  // needs no credentials.
  static skipAuth = true

  static description =
    'Field-level diff between two backup snapshots — added/removed/modified ' +
    'records and per-field changes, computed locally with no API calls'

  static examples = [
    '<%= config.bin %> backup diff ./backup-mon ./backup-tue',
    '<%= config.bin %> backup diff ./old ./new --output json',
    '<%= config.bin %> backup diff ./old ./new --raw',
  ]

  static args = {
    a: Args.string({
      required: true,
      description: 'first (older) backup directory',
    }),
    b: Args.string({
      required: true,
      description: 'second (newer) backup directory',
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    raw: Flags.boolean({
      description:
        'Do not resolve custom-field names/option labels (show raw hash keys/ids)',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(BackupDiffCommand)

    const a = loadBackup(args.a)
    const b = loadBackup(args.b)
    for (const [loaded, path] of [
      [a, args.a],
      [b, args.b],
    ]) {
      if (Object.keys(loaded.resources).length === 0) {
        throw new CliError(
          `${path} is not a pdcli backup (no resource files found)`,
          { exitCode: 64 },
        )
      }
    }

    const result = diffBackups(a, b, { resolveNames: !flags.raw })

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(result, {})
      return
    }

    const cell = (v) =>
      v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    await this.outputResults(result.changes, {
      resource: { header: 'Resource' },
      id: { header: 'ID' },
      change: { header: 'Change' },
      field: { header: 'Field', get: (r) => r.field ?? '' },
      oldValue: { header: 'Old', get: (r) => cell(r.oldValue) },
      newValue: { header: 'New', get: (r) => cell(r.newValue) },
    })

    const { added, removed, modified, fieldsChanged } = result.summary
    this.log('')
    this.log(
      `${added} added · ${removed} removed · ${modified} modified ` +
        `(${fieldsChanged} field changes)`,
    )
    if (result.skipped.length > 0) {
      this.log(
        `Skipped (present in one snapshot only): ` +
          result.skipped.map((s) => `${s.resource}[${s.presentIn}]`).join(', '),
      )
    }
  }
}
