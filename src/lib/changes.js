/** Per-entity field that best labels a change-feed row. */
const TITLE_FIELD = {
  deals: 'title',
  persons: 'name',
  organizations: 'name',
  activities: 'subject',
  products: 'name',
}

/**
 * Classify a row as 'created' or 'updated' relative to the `since` boundary.
 * `updated_since` filters on update_time, so a returned row whose add_time is
 * at/after the boundary was CREATED in this window; one created earlier was
 * merely UPDATED. With no add_time (or no boundary) we can't tell — 'updated'.
 * @param {object} row a deal/person/org/activity/product record
 * @param {string|null} since RFC3339 boundary
 * @returns {'created'|'updated'}
 */
export function categorizeChange(row, since) {
  if (row.add_time == null || since == null) return 'updated'
  return new Date(row.add_time) >= new Date(since) ? 'created' : 'updated'
}

/**
 * Fold per-entity result arrays into one unified change feed, tagging each row
 * with its entity, change type (created/updated), and the title field for its
 * entity. Rows are sorted by update_time ascending (missing timestamps last),
 * and the newest update_time seen is returned as the next watermark.
 *
 * @param {Record<string, object[]>} byEntity entity name → records
 * @param {string|null} since the boundary used (for created/updated tagging)
 * @returns {{ rows: object[], maxUpdate: (Date|null) }}
 */
export function buildChangeFeed(byEntity, since) {
  const rows = []
  let maxUpdate = null

  for (const [entity, items] of Object.entries(byEntity)) {
    for (const item of items) {
      const updateTime = item.update_time ?? null
      rows.push({
        entity,
        id: item.id,
        title: item[TITLE_FIELD[entity]] ?? null,
        change: categorizeChange(item, since),
        addTime: item.add_time ?? null,
        updateTime,
      })
      if (updateTime != null) {
        const d = new Date(updateTime)
        if (maxUpdate == null || d > maxUpdate) maxUpdate = d
      }
    }
  }

  // Ascending update_time; rows without a timestamp sort last.
  rows.sort((a, b) => {
    if (a.updateTime == null) return b.updateTime == null ? 0 : 1
    if (b.updateTime == null) return -1
    return a.updateTime.localeCompare(b.updateTime)
  })

  return { rows, maxUpdate }
}
