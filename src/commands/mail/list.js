import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'

/**
 * The deal mailMessages list wraps each message under
 * `{ object, timestamp, data: {…message…} }`; unwrap to the message object.
 * Single-message fetches return the message directly, so a value with no
 * nested `data` object passes through unchanged.
 * @param {object} item
 * @returns {object}
 */
export function unwrapMailMessage(item) {
  return item?.data && typeof item.data === 'object' ? item.data : item
}

/**
 * 'sent' when the mail left the mailbox, else 'received'. `sent_flag` is a
 * number-boolean (0/1).
 * @param {object} msg
 * @returns {'sent' | 'received'}
 */
export function mailDirection(msg) {
  return msg?.sent_flag ? 'sent' : 'received'
}

/** First participant's address (or name) from a from/to array. */
function firstAddress(parties) {
  if (!Array.isArray(parties) || parties.length === 0) return ''
  return parties[0].email_address ?? parties[0].name ?? ''
}

const columns = {
  id: { header: 'ID' },
  message_time: { header: 'Time' },
  direction: { header: 'Dir', get: (row) => mailDirection(row) },
  from: { header: 'From', get: (row) => firstAddress(row.from) },
  to: { header: 'To', get: (row) => firstAddress(row.to) },
  subject: {
    header: 'Subject',
    get: (row) => (row.subject ?? '').slice(0, 40),
  },
  snippet: {
    header: 'Snippet',
    get: (row) => (row.snippet ?? '').slice(0, 60),
  },
}

export default class MailListCommand extends BaseCommand {
  static description =
    'List the synced email linked to a deal. Message bodies are excluded by ' +
    'design (privacy posture) — the 225-char snippet is the preview; each row ' +
    'carries has_body_flag and body_url so you can fetch a body yourself. ' +
    'Requires the mail:read scope and a configured email sync.'

  static examples = [
    '<%= config.bin %> mail list --deal 42',
    '<%= config.bin %> mail list --deal 42 --output json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    deal: Flags.integer({
      required: true,
      description: 'Deal ID to list mail for',
    }),
  }

  async run() {
    const { flags } = await this.parse(MailListCommand)
    const limit = flags.limit ?? 100

    const items = await collectPages(
      this.apiClient.pageV1(`/api/v1/deals/${flags.deal}/mailMessages`, {
        limit: Math.min(limit, 100),
      }),
      limit,
    )
    await this.outputResults(items.map(unwrapMailMessage), columns)
  }
}
