import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { collectPages } from '../../lib/pagination.js'
import { getFields, makeResolver } from '../../lib/fields.js'
import { assembleContext } from '../../lib/deal-context.js'

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

    // The id-only slices need only the deal id; person/org need the resolved
    // join keys. All run concurrently after the deal GET.
    const [person, org, activities, notes, products, participants] =
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
  }
}
