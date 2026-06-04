import BaseCommand from '../../base-command.js'

const columns = {
  id: { header: 'ID' },
  subscription_url: { header: 'URL' },
  event_action: { header: 'Action' },
  event_object: { header: 'Object' },
  version: { header: 'Version' },
  is_active: {
    header: 'Active',
    get: (row) => row.is_active ?? row.active_flag ?? '',
  },
}

export default class WebhookListCommand extends BaseCommand {
  static description = 'List webhooks'

  static examples = [
    '<%= config.bin %> webhook list',
    '<%= config.bin %> webhook list --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    await this.parse(WebhookListCommand)

    const body = await this.apiClient.get('/api/v1/webhooks')
    await this.outputResults(body.data, columns)
  }
}
