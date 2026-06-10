import { computeVelocity } from './analytics.js'

const DAY_MS = 86_400_000
// Mirrors STALE_DAYS in analytics.js / audit.js (no shared constants module yet).
const STALE_DAYS = 14

/**
 * Per-owner sales scorecard: velocity (win rate, cycle, won value) plus a few
 * deal-only hygiene counts, with owner names joined from the users roster.
 *
 * Deals should be the open + won + lost set; won/lost are expected to already
 * be windowed by the caller (computeVelocity also re-checks won_time/lost_time
 * against `since`, so extra closed rows are tolerated). Deals are partitioned
 * by `owner_id`; a deal with no owner falls into the "Unassigned" bucket.
 *
 * Hygiene counts cover OPEN deals only:
 *   - staleOpen:      no update in over 14 days
 *   - pastClose:      expected_close_date already in the past
 *   - noCloseDate:    no expected_close_date set
 *   - missingContact: neither a person nor an organization linked
 *
 * @param {object[]} deals open + closed deals (owner_id, status, value, …)
 * @param {object[]} users v1 users roster (id, name, active_flag)
 * @param {{ since: Date, now: Date, ownerId?: number }} options
 * @returns {object[]} one row per owner, velocity-per-day desc (nulls last)
 */
export function computeScorecard(deals, users, { since, now, ownerId } = {}) {
  const scoped =
    ownerId == null ? deals : deals.filter((d) => d.owner_id === ownerId)

  const userById = new Map(users.map((u) => [u.id, u]))
  const today = now.toISOString().slice(0, 10)

  // Partition by owner_id; null owner is its own bucket (Map keys allow null).
  const byOwner = new Map()
  for (const deal of scoped) {
    const key = deal.owner_id ?? null
    if (!byOwner.has(key)) byOwner.set(key, [])
    byOwner.get(key).push(deal)
  }

  const rows = [...byOwner.entries()].map(([owner, ownerDeals]) => {
    const velocity = computeVelocity(ownerDeals, { since, now })
    const user = owner == null ? undefined : userById.get(owner)

    const open = ownerDeals.filter((d) => d.status === 'open')
    const staleOpen = open.filter(
      (d) => now - new Date(d.update_time) > STALE_DAYS * DAY_MS,
    ).length
    const pastClose = open.filter(
      (d) => d.expected_close_date != null && d.expected_close_date < today,
    ).length
    const noCloseDate = open.filter((d) => d.expected_close_date == null).length
    const missingContact = open.filter(
      (d) => d.person_id == null && d.org_id == null,
    ).length

    return {
      ownerId: owner,
      ownerName: user?.name ?? (owner == null ? 'Unassigned' : `#${owner}`),
      active: user ? user.active_flag : null,
      ...velocity,
      staleOpen,
      pastClose,
      noCloseDate,
      missingContact,
    }
  })

  // Velocity-per-day descending with null-velocity owners pinned last
  // (mapped to -Infinity), name as the stable tie-break.
  const velKey = (r) =>
    r.velocityPerDay == null ? -Infinity : r.velocityPerDay
  return rows.sort((a, b) => {
    if (velKey(a) !== velKey(b)) return velKey(b) - velKey(a)
    return a.ownerName.localeCompare(b.ownerName)
  })
}
