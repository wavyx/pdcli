const DAY_MS = 86_400_000
// Mirrors STALE_DAYS in analytics.js / audit.js / scorecard.js.
const STALE_DAYS = 14

/**
 * Assemble a denormalized deal "context" bundle from its already-fetched
 * slices and derive a set of agent-friendly risk flags. Pure: the command does
 * the fetching and custom-field resolution, then hands the parts here.
 *
 * Flags (all booleans unless a count):
 *   - missingContact:   no person and no organization linked
 *   - staleOpen:        open and not updated in over 14 days
 *   - pastClose:        open and past its expected close date
 *   - noCloseDate:      open with no expected close date
 *   - noOpenActivities: no not-done activity in the bundle
 *   - activity/note/product/participant counts
 *
 * @param {{ deal: object, person?: object|null, org?: object|null,
 *   activities?: object[], notes?: object[], products?: object[],
 *   participants?: object[] }} parts
 * @param {{ now: Date }} options
 */
export function assembleContext(parts, { now }) {
  const {
    deal,
    person = null,
    org = null,
    activities = [],
    notes = [],
    products = [],
    participants = [],
  } = parts

  const open = deal.status === 'open'
  const today = now.toISOString().slice(0, 10)

  const flags = {
    missingContact: deal.person_id == null && deal.org_id == null,
    staleOpen:
      open &&
      deal.update_time != null &&
      now - new Date(deal.update_time) > STALE_DAYS * DAY_MS,
    pastClose:
      open &&
      deal.expected_close_date != null &&
      deal.expected_close_date < today,
    noCloseDate: open && deal.expected_close_date == null,
    noOpenActivities: !activities.some((a) => !a.done),
    activityCount: activities.length,
    noteCount: notes.length,
    productCount: products.length,
    participantCount: participants.length,
  }

  return { deal, person, org, activities, notes, products, participants, flags }
}
