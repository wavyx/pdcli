import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { getFields, makeResolver } from '../../lib/fields.js'
import { assembleContext } from '../../lib/deal-context.js'
import { fetchDealMail, mailDirection } from '../mail/list.js'

/**
 * Condense a deal's mail messages into an agent-friendly signal. Returns null
 * when there is nothing to summarize (no synced mail linked to the deal).
 * Bodies are excluded by design — the 225-char snippet is the only preview.
 * @param {object[]} messages already-unwrapped mail message objects
 * @returns {{ message_count: number, last_message_at: string|null,
 *   last_direction: 'sent'|'received', latest_subject: string|null,
 *   participants: { name: string|null, email: string|null,
 *   linked_person_id: number|null }[] } | null}
 */
export function summarizeMail(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null

  // Latest by message_time — list order is not guaranteed. ISO 8601 strings
  // compare correctly lexically.
  let latest = messages[0]
  for (const m of messages) {
    if ((m.message_time ?? '') > (latest.message_time ?? '')) latest = m
  }

  const participants = []
  const seen = new Set()
  for (const m of messages) {
    for (const p of [...(m.from ?? []), ...(m.to ?? [])]) {
      const key = p.email_address ?? p.name ?? p.linked_person_id
      if (key == null || seen.has(key)) continue
      seen.add(key)
      participants.push({
        name: p.name ?? null,
        email: p.email_address ?? null,
        linked_person_id: p.linked_person_id ?? null,
      })
    }
  }

  return {
    message_count: messages.length,
    last_message_at: latest.message_time ?? null,
    last_direction: mailDirection(latest),
    latest_subject: latest.subject ?? null,
    participants,
  }
}

export default class DealContextCommand extends BaseCommand {
  static description =
    'One-call denormalized deal bundle — deal + person + org + activities + ' +
    'notes + products + participants, custom fields resolved to names and ' +
    'risk flags derived. Prompt-ready for agents (the joins v2 will not do).'

  static examples = [
    '<%= config.bin %> deal context 42',
    '<%= config.bin %> deal context 42 --no-notes --no-products',
    '<%= config.bin %> deal context 42 --output json',
  ]

  static args = {
    id: Args.integer({ required: true, description: 'deal ID' }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    'no-activities': Flags.boolean({
      description: 'Skip the activities slice',
    }),
    'no-notes': Flags.boolean({ description: 'Skip the notes slice' }),
    'no-products': Flags.boolean({ description: 'Skip the products slice' }),
    'no-participants': Flags.boolean({
      description: 'Skip the participants slice',
    }),
    mail: Flags.boolean({
      description:
        'Include a mail summary (off by default; needs the mail:read scope and email sync)',
    }),
    'mail-limit': Flags.integer({
      description: 'Max mail messages to scan for the summary',
      default: 50,
    }),
    'activity-limit': Flags.integer({
      description: 'Max activities to include',
      default: 50,
    }),
    'note-limit': Flags.integer({
      description: 'Max notes to include',
      default: 50,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(DealContextCommand)
    const now = new Date()
    const id = args.id

    const dealBody = await this.apiClient.get(`/api/v2/deals/${id}`)
    const deal = dealBody.data

    // Mail needs the mail:read scope + a configured email sync; many api-token
    // users have neither, so a 403 / permission error (or any mail-only
    // failure) degrades to null rather than sinking the whole context bundle.
    const fetchMail = async () => {
      if (!flags.mail) return null
      try {
        const items = await fetchDealMail(
          this.apiClient,
          id,
          flags['mail-limit'],
        )
        return summarizeMail(items)
      } catch {
        return null
      }
    }

    // The id-only slices need only the deal id; person/org need the resolved
    // join keys. All run concurrently after the deal GET.
    const [person, org, activities, notes, products, participants, mail] =
      await Promise.all([
        deal.person_id != null
          ? this.apiClient
              .get(`/api/v2/persons/${deal.person_id}`)
              .then((b) => b.data)
          : null,
        deal.org_id != null
          ? this.apiClient
              .get(`/api/v2/organizations/${deal.org_id}`)
              .then((b) => b.data)
          : null,
        flags['no-activities']
          ? []
          : collectPages(
              this.apiClient.pageV2('/api/v2/activities', {
                deal_id: id,
                limit: 500,
              }),
              flags['activity-limit'],
            ),
        flags['no-notes']
          ? []
          : collectPages(
              this.apiClient.pageV1('/api/v1/notes', {
                deal_id: id,
                limit: 100,
              }),
              flags['note-limit'],
            ),
        flags['no-products']
          ? []
          : collectPages(
              this.apiClient.pageV2(`/api/v2/deals/${id}/products`, {
                limit: 500,
              }),
            ),
        flags['no-participants']
          ? []
          : collectPages(
              this.apiClient.pageV1(`/api/v1/deals/${id}/participants`, {
                limit: 500,
              }),
            ),
        fetchMail(),
      ])

    // Resolve custom-field hash keys → names per entity so the bundle is
    // agent-readable. getFields is memoized per run; skip empty/null slices.
    const resolve = async (entity, value) => {
      if (value == null || (Array.isArray(value) && value.length === 0)) {
        return value
      }
      const resolver = makeResolver(await getFields(this.apiClient, entity))
      return Array.isArray(value)
        ? value.map((r) => resolver.resolveCustomFields(r))
        : resolver.resolveCustomFields(value)
    }
    const [rDeal, rPerson, rOrg, rActivities, rNotes] = await Promise.all([
      resolve('deal', deal),
      resolve('person', person),
      resolve('org', org),
      resolve('activity', activities),
      resolve('note', notes),
    ])

    const bundle = assembleContext(
      {
        deal: rDeal,
        person: rPerson,
        org: rOrg,
        activities: rActivities,
        notes: rNotes,
        products,
        participants,
      },
      { now, activitiesFetched: !flags['no-activities'] },
    )
    // assembleContext is mail-agnostic; the mail summary is attached here so
    // an unfetched slice is `null`, never `false`.
    bundle.mail = mail

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(bundle, {})
      return
    }

    const d = bundle.deal
    this.log(`Deal ${d.id}: ${d.title ?? ''} (${d.status ?? ''})`)
    this.log(`  Value: ${d.value ?? '—'} ${d.currency ?? ''}`.trimEnd())
    this.log(
      `  Person: ${bundle.person?.name ?? '—'} · Org: ${bundle.org?.name ?? '—'}`,
    )
    const f = bundle.flags
    this.log(
      `  Activities: ${f.activityCount} · Notes: ${f.noteCount} · ` +
        `Products: ${f.productCount} · Participants: ${f.participantCount}`,
    )
    const risks = Object.entries(f)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
    this.log(`  Flags: ${risks.length > 0 ? risks.join(', ') : 'none'}`)
    if (bundle.mail) {
      const m = bundle.mail
      this.log(
        `  Mail: ${m.message_count} msgs · last ${m.last_direction}` +
          (m.last_message_at ? ` ${m.last_message_at}` : ''),
      )
    }
  }
}
