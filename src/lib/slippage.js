const DAY_MS = 86_400_000

/** True for a null/empty/whitespace changelog value (no date set). */
function isBlank(value) {
  return value == null || String(value).trim() === ''
}

/** Parse a YYYY-MM-DD (or RFC 3339) date string to ms, or null if unparseable. */
function parseDateMs(value) {
  const ms = Date.parse(String(value))
  return Number.isNaN(ms) ? null : ms
}

/**
 * Close-date slippage per open deal, mined from each deal's changelog.
 *
 * For every `expected_close_date` change we classify the transition:
 *   - blank → date   : the initial set (or a re-set after clearing) — NOT a push
 *   - date  → blank  : the field was cleared — NOT a push
 *   - date  → date   : a real move. A FORWARD move (new date later than old)
 *                      is a push; its day delta is added to the net slip. A
 *                      PULL-IN (new earlier than old) is observed but does NOT
 *                      subtract — net slip is the sum of forward deltas only,
 *                      so a deal that pushed then pulled back still surfaces the
 *                      slippage it caused. Unparseable dates skip the transition.
 *
 * `originalCloseDate` is the earliest date ever set (oldest transition's value),
 * `currentCloseDate` is the deal's live `expected_close_date`. Rows arrive
 * newest-first (the changelog's native order), so transitions are sorted by
 * time ascending to derive the original date deterministically.
 *
 * @param {object[]} openDeals open deals (id, title, owner_id, expected_close_date)
 * @param {{ dealId: number, stageId: number, rows: object[] }[]} transitionsByDeal
 *   mined changelogs keyed by deal id; a deal with no entry is treated as 0 pushes
 * @param {{ minPushes?: number }} [options]
 * @returns {object[]} rows for deals with pushCount >= minPushes, net-slip desc
 */
export function computeSlippage(
  openDeals,
  transitionsByDeal,
  { minPushes } = {},
) {
  const threshold = minPushes ?? 1
  const rowsByDeal = new Map(transitionsByDeal.map((t) => [t.dealId, t.rows]))

  const result = []
  for (const deal of openDeals) {
    const rows = rowsByDeal.get(deal.id)
    if (rows == null) continue

    // Oldest-first so the first date set is found deterministically.
    const changes = rows
      .filter((r) => r.field_key === 'expected_close_date')
      .slice()
      .sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')))

    let pushCount = 0
    let netDaysSlipped = 0
    let originalCloseDate = null

    for (const change of changes) {
      const oldBlank = isBlank(change.old_value)
      const newBlank = isBlank(change.new_value)

      // Capture the first parseable date we ever see as the original — garbage
      // values never become the reported original close date.
      if (
        originalCloseDate == null &&
        !oldBlank &&
        parseDateMs(change.old_value) != null
      ) {
        originalCloseDate = String(change.old_value)
      }
      if (
        originalCloseDate == null &&
        !newBlank &&
        parseDateMs(change.new_value) != null
      ) {
        originalCloseDate = String(change.new_value)
      }

      // Initial set or clear: not a push.
      if (oldBlank || newBlank) continue

      const oldMs = parseDateMs(change.old_value)
      const newMs = parseDateMs(change.new_value)
      if (oldMs == null || newMs == null) continue // unparseable: skip

      const deltaDays = Math.round((newMs - oldMs) / DAY_MS)
      if (deltaDays > 0) {
        pushCount++
        netDaysSlipped += deltaDays
      }
    }

    if (pushCount < threshold) continue

    result.push({
      dealId: deal.id,
      title: deal.title,
      ownerId: deal.owner_id,
      pushCount,
      netDaysSlipped,
      originalCloseDate,
      currentCloseDate: deal.expected_close_date ?? null,
    })
  }

  return result.sort((a, b) => b.netDaysSlipped - a.netDaysSlipped)
}
