import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'

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

/**
 * Page a deal's mail messages with OFFSET paging and return unwrapped message
 * objects. Unlike every other v1 list, `/deals/{id}/mailMessages` paginates
 * with start/limit/more_items_in_collection but returns NO `next_start`, so the
 * shared cursor pager (pageV1) would re-request page 0 forever / duplicate rows.
 * Advance `start` by the returned count instead, and stop on an empty page.
 * @param {object} client
 * @param {number} dealId
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
export async function fetchDealMail(client, dealId, limit = 100) {
  const path = `/api/v1/deals/${dealId}/mailMessages`
  const out = []
  let start = 0
  while (out.length < limit) {
    const body = await client.get(path, {
      query: { start, limit: Math.min(limit - out.length, 100) },
    })
    const page = body.data ?? []
    out.push(...page)
    if (
      page.length === 0 ||
      !body.additional_data?.pagination?.more_items_in_collection
    ) {
      break
    }
    start += page.length
  }
  return out.slice(0, limit).map(unwrapMailMessage)
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
    const items = await fetchDealMail(
      this.apiClient,
      flags.deal,
      flags.limit ?? 100,
    )
    await this.outputResults(items, columns)
  }
}
