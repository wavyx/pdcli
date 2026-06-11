/**
 * Stable per-finding key, namespaced by check so the same id in two checks
 * can't collide. Most checks carry a record `id`; a few identify a group with
 * no single id, so they key on their stable group identity instead:
 *   - duplicate-persons: the shared email
 *   - duplicate-orgs: the normalized name (exact) or sorted ids (fuzzy)
 *   - overdue-activities: the owner id (a per-owner pile-up row)
 * Caller must drop kind:'note' info rows before keying — they are not findings.
 * @param {string} checkName
 * @param {object} item
 * @returns {string}
 */
export function keyOf(checkName, item) {
  switch (checkName) {
    case 'duplicate-persons':
      return String(item.email)
    case 'overdue-activities':
      return String(item.owner_id)
    case 'duplicate-orgs':
      return item.kind === 'fuzzy' ? item.ids.join('-') : String(item.name)
    default:
      return String(item.id)
  }
}

/**
 * Diff the current audit findings against the prior persisted state and return
 * only the findings that are NEW since last run, plus the next state to store.
 *
 * State is `{ checkName: [key, ...] }`. Per check it is REPLACED (not unioned),
 * so a finding that clears is pruned and re-fires if it later re-trips; checks
 * not present in this run's results keep their stored keys untouched. kind:note
 * info rows are never findings.
 *
 * @param {{ name: string, severity: string, title: string, items: object[] }[]} checkResults
 *   runChecks() output
 * @param {Record<string, string[]>} [priorState]
 * @returns {{ newFindings: { check: string, severity: string, key: string, item: object }[],
 *   nextState: Record<string, string[]> }}
 */
export function computeNewFindings(checkResults, priorState = {}) {
  const nextState = { ...priorState }
  const newFindings = []

  for (const result of checkResults) {
    const findings = result.items.filter((i) => i.kind !== 'note')
    const stored = new Set(priorState[result.name] ?? [])

    for (const item of findings) {
      const key = keyOf(result.name, item)
      if (!stored.has(key)) {
        newFindings.push({
          check: result.name,
          severity: result.severity,
          key,
          item,
        })
      }
    }

    nextState[result.name] = findings.map((item) => keyOf(result.name, item))
  }

  return { newFindings, nextState }
}
