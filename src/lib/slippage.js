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
 * `originalCloseDate` is the earliest date ever set, `currentCloseDate` is the
 * deal's live `expected_close_date`. Rows arrive newest-first and rapid edits
 * collide at the API's 1-second granularity, so a time sort is NOT a total
 * order — the original is derived from the transition GRAPH instead: the chain
 * root is the row whose old_value never appears as any other row's new_value.
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

    const changes = rows.filter((r) => r.field_key === 'expected_close_date')

    // Original = the chain root's value: the row whose old_value is never
    // produced as another row's new_value. Graph-derived so same-second ties
    // (which break a time sort) can't pick the wrong "first" date. The root's
    // old_value is the original when it's a real date; on a leading
    // blank->date (initial set) the root's new_value is the first date.
    const producedValues = new Set(
      changes
        .filter((c) => !isBlank(c.new_value))
        .map((c) => String(c.new_value)),
    )
    let originalCloseDate = null
    for (const change of changes) {
      const oldReal = !isBlank(change.old_value)
      // Root = a row whose old_value was never produced by another row.
      if (oldReal && producedValues.has(String(change.old_value))) continue
      // The original is the root's old_value when it's a real date, else the
      // first date the chain actually sets (root's new_value).
      if (oldReal && parseDateMs(change.old_value) != null) {
        originalCloseDate = String(change.old_value)
        break
      }
      if (parseDateMs(change.new_value) != null) {
        originalCloseDate = String(change.new_value)
        break
      }
    }

    let pushCount = 0
    let netDaysSlipped = 0

    for (const change of changes) {
      const oldBlank = isBlank(change.old_value)
      const newBlank = isBlank(change.new_value)

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
