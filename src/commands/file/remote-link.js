import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { outputRecord } from '../../lib/entity-view.js'
import { CliError } from '../../lib/errors.js'

export default class FileRemoteLinkCommand extends BaseCommand {
  static description = 'Link an existing remote file (Google Drive) to an item'

  static examples = [
    '<%= config.bin %> file remote-link --deal 42 --remote-id 1AbC',
    '<%= config.bin %> file remote-link --person 9 --remote-id 1AbC --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    deal: Flags.integer({ description: 'Link to a deal ID' }),
    org: Flags.integer({ description: 'Link to an organization ID' }),
    person: Flags.integer({ description: 'Link to a person ID' }),
    'remote-id': Flags.string({
      required: true,
      description: 'ID of the remote file (e.g. Google Drive file ID)',
    }),
    'remote-location': Flags.string({
      description: 'Remote storage location',
      options: ['googledrive'],
      default: 'googledrive',
    }),
  }

  async run() {
    const { flags } = await this.parse(FileRemoteLinkCommand)

    const items = [
      ['deal', flags.deal],
      ['organization', flags.org],
      ['person', flags.person],
    ].filter(([, id]) => id != null)

    if (items.length !== 1) {
      throw new CliError('Pass exactly one of --deal, --org, or --person', {
        exitCode: 64,
      })
    }

    const [item_type, item_id] = items[0]

    const res = await this.apiClient.postForm('/api/v1/files/remoteLink', {
      item_type,
      item_id,
      remote_id: flags['remote-id'],
      remote_location: flags['remote-location'],
    })

    await outputRecord(this, res.data)
  }
}
