import BaseCommand from '../../../base-command.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  color: { header: 'Color' },
}

export default class LeadLabelListCommand extends BaseCommand {
  static description = 'List lead labels'

  static examples = [
    '<%= config.bin %> lead label list',
    '<%= config.bin %> lead label list --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run() {
    await this.parse(LeadLabelListCommand)
    // leadLabels has no pagination — all labels are always returned.
    const body = await this.apiClient.get('/api/v1/leadLabels')
    await this.outputResults(body.data, columns)
  }
}
