import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildWriteBody } from '../../lib/input.js'
import { outputRecord } from '../../lib/entity-view.js'

export default class WebhookCreateCommand extends BaseCommand {
  static description = 'Create a webhook'

  static examples = [
    '<%= config.bin %> webhook create --url https://example.com/hook --event-action change --event-object deal',
    '<%= config.bin %> webhook create --url https://example.com/hook --event-action "*" --event-object "*"',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    url: Flags.string({
      required: true,
      description: 'Webhook subscription URL',
    }),
    'event-action': Flags.string({
      required: true,
      description: 'Event action to subscribe to',
      options: ['create', 'change', 'delete', '*'],
    }),
    'event-object': Flags.string({
      required: true,
      description: 'Event object to subscribe to',
      options: [
        'activity',
        'board',
        'deal',
        'deal_installment',
        'deal_product',
        'lead',
        'note',
        'organization',
        'person',
        'phase',
        'pipeline',
        'product',
        'project',
        'stage',
        'task',
        'user',
        '*',
      ],
    }),
    name: Flags.string({ description: 'Webhook name' }),
    version: Flags.string({
      description: 'Webhook payload version',
      default: '2.0',
    }),
    'http-auth-user': Flags.string({
      description: 'HTTP basic auth username for the endpoint',
      dependsOn: ['http-auth-password'],
    }),
    'http-auth-password': Flags.string({
      description: 'HTTP basic auth password for the endpoint',
      dependsOn: ['http-auth-user'],
    }),
  }

  async run() {
    const { flags } = await this.parse(WebhookCreateCommand)

    const body = buildWriteBody({
      typed: {
        subscription_url: flags.url,
        event_action: flags['event-action'],
        event_object: flags['event-object'],
        version: flags.version,
        name: flags.name,
        http_auth_user: flags['http-auth-user'],
        http_auth_password: flags['http-auth-password'],
      },
    })

    const res = await this.apiClient.post('/api/v1/webhooks', { body })
    await outputRecord(this, res.data)
  }
}
