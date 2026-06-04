const DAY_MS = 86_400_000
const STALE_DAYS = 14
const ANCIENT_FALLBACK_DAYS = 168 // ~2× the median B2B cycle
const ANCIENT_CYCLE_MULTIPLIER = 2

function openDeals(data) {
  return data.deals.filter((d) => d.status === 'open')
}

function today(now) {
  return now.toISOString().slice(0, 10)
}

/**
 * Data-quality checks. Each returns flagged items; detection rules follow
 * common RevOps hygiene practice (see docs for thresholds).
 * @type {{ name: string, severity: 'must' | 'should', title: string, run: (data: object, ctx: { now: Date }) => object[] }[]}
 */
export const AUDIT_CHECKS = [
  {
    name: 'stale-deals',
    severity: 'must',
    title: `Open deals untouched for >${STALE_DAYS} days`,
    run: (data, { now }) =>
      openDeals(data)
        .filter((d) => now - new Date(d.update_time) > STALE_DAYS * DAY_MS)
        .map((d) => ({
          id: d.id,
          title: d.title,
          days: Math.floor((now - new Date(d.update_time)) / DAY_MS),
        })),
  },
  {
    name: 'no-next-activity',
    severity: 'must',
    title: 'Open deals with no future activity scheduled',
    run: (data, { now }) => {
      const withFuture = new Set(
        data.activities
          .filter(
            (a) => !a.done && a.due_date >= today(now) && a.deal_id != null,
          )
          .map((a) => a.deal_id),
      )
      return openDeals(data)
        .filter((d) => !withFuture.has(d.id))
        .map((d) => ({ id: d.id, title: d.title }))
    },
  },
  {
    name: 'past-close-date',
    severity: 'must',
    title: 'Open deals past their expected close date',
    run: (data, { now }) =>
      openDeals(data)
        .filter(
          (d) =>
            d.expected_close_date != null && d.expected_close_date < today(now),
        )
        .map((d) => ({
          id: d.id,
          title: d.title,
          expected_close_date: d.expected_close_date,
        })),
  },
  {
    name: 'missing-fields',
    severity: 'must',
    title: 'Open deals missing owner, person/org, value, or currency',
    run: (data) =>
      openDeals(data)
        .map((d) => {
          const missing = []
          if (d.owner_id == null) missing.push('owner')
          if (d.person_id == null && d.org_id == null)
            missing.push('person/org')
          if (d.value == null || d.value <= 0) missing.push('value')
          else if (!d.currency) missing.push('currency')
          return { id: d.id, title: d.title, missing }
        })
        .filter((item) => item.missing.length > 0),
  },
  {
    name: 'ancient-deals',
    severity: 'must',
    title: 'Open deals far older than the typical won cycle',
    run: (data, { now }) => {
      const cycles = data.deals
        .filter((d) => d.status === 'won' && d.won_time && d.add_time)
        .map((d) => (new Date(d.won_time) - new Date(d.add_time)) / DAY_MS)
      const avgCycle =
        cycles.length > 0
          ? cycles.reduce((a, b) => a + b, 0) / cycles.length
          : null
      const thresholdDays =
        avgCycle != null
          ? avgCycle * ANCIENT_CYCLE_MULTIPLIER
          : ANCIENT_FALLBACK_DAYS
      return openDeals(data)
        .filter((d) => now - new Date(d.add_time) > thresholdDays * DAY_MS)
        .map((d) => ({
          id: d.id,
          title: d.title,
          ageDays: Math.floor((now - new Date(d.add_time)) / DAY_MS),
          thresholdDays: Math.round(thresholdDays),
        }))
    },
  },
  {
    name: 'missing-close-time',
    severity: 'should',
    title: 'Closed deals missing their close timestamp',
    run: (data) =>
      data.deals
        .filter(
          (d) =>
            (d.status === 'won' && d.won_time == null) ||
            (d.status === 'lost' && d.lost_time == null),
        )
        .map((d) => ({ id: d.id, title: d.title, status: d.status })),
  },
  {
    name: 'duplicate-persons',
    severity: 'must',
    title: 'Persons sharing the same email',
    run: (data) => {
      const byEmail = new Map()
      for (const person of data.persons) {
        for (const entry of person.emails ?? []) {
          const email = entry.value?.trim().toLowerCase()
          if (!email) continue
          byEmail.set(email, [...(byEmail.get(email) ?? []), person.id])
        }
      }
      return [...byEmail.entries()]
        .filter(([, ids]) => new Set(ids).size > 1)
        .map(([email, ids]) => ({ email, ids: [...new Set(ids)] }))
    },
  },
  {
    name: 'uncontactable-persons',
    severity: 'must',
    title: 'Persons with neither email nor phone',
    run: (data) =>
      data.persons
        .filter(
          (p) =>
            !(p.emails ?? []).some((e) => e.value) &&
            !(p.phones ?? []).some((ph) => ph.value),
        )
        .map((p) => ({ id: p.id, name: p.name })),
  },
  {
    name: 'duplicate-orgs',
    severity: 'should',
    title: 'Organizations with the same normalized name',
    run: (data) => {
      const byName = new Map()
      for (const org of data.organizations) {
        const key = normalizeOrgName(org.name)
        if (!key) continue
        byName.set(key, [...(byName.get(key) ?? []), org.id])
      }
      return [...byName.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([name, ids]) => ({ name, ids }))
    },
  },
  {
    name: 'overdue-activities',
    severity: 'should',
    title: 'Overdue open activities piling up per owner',
    run: (data, { now }) => {
      const byOwner = new Map()
      for (const activity of data.activities) {
        if (activity.done || activity.due_date >= today(now)) continue
        byOwner.set(
          activity.owner_id,
          (byOwner.get(activity.owner_id) ?? 0) + 1,
        )
      }
      return [...byOwner.entries()].map(([owner_id, overdue]) => ({
        owner_id,
        overdue,
      }))
    },
  },
  {
    name: 'currency-missing',
    severity: 'should',
    title: 'Deals with a value but no currency',
    run: (data) =>
      openDeals(data)
        .filter((d) => d.value != null && d.value > 0 && !d.currency)
        .map((d) => ({ id: d.id, title: d.title, value: d.value })),
  },
]

function normalizeOrgName(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/\b(inc|ltd|llc|gmbh|sa|sarl|bv|corp|co)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Run all (or a subset of) hygiene checks over pre-fetched account data.
 * @param {{ deals: object[], persons: object[], organizations: object[], activities: object[] }} data
 * @param {{ now: Date, only?: string[] }} options
 * @returns {{ name: string, severity: string, title: string, count: number, items: object[] }[]}
 */
export function runChecks(data, { now, only } = {}) {
  return AUDIT_CHECKS.filter((check) => !only || only.includes(check.name)).map(
    (check) => {
      const overdueTotal = check.name === 'overdue-activities'
      const items = check.run(data, { now })
      return {
        name: check.name,
        severity: check.severity,
        title: check.title,
        count: overdueTotal
          ? items.reduce((sum, i) => sum + i.overdue, 0)
          : items.length,
        items,
      }
    },
  )
}
