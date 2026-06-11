import { describe, it, expect } from 'vitest'
import { keyOf, computeNewFindings, summarize } from '../../src/lib/watch.js'

describe('summarize', () => {
  it('prefers title, then name, then email, then owner, then a dash', () => {
    expect(summarize({ title: 'T', name: 'N' })).toBe('T')
    expect(summarize({ name: 'N', email: 'e@x' })).toBe('N')
    expect(summarize({ email: 'e@x' })).toBe('e@x')
    expect(summarize({ owner_id: 9 })).toBe('owner 9')
    expect(summarize({ kind: 'fuzzy', names: ['a', 'b'], ids: [1, 2] })).toBe(
      '—',
    )
  })
})

describe('keyOf', () => {
  it('keys id-bearing checks by record id', () => {
    expect(keyOf('stale-deals', { id: 7, title: 'X' })).toBe('7')
    expect(keyOf('uncontactable-persons', { id: 3, name: 'Y' })).toBe('3')
  })
  it('keys duplicate-persons by email (id-less group identity)', () => {
    expect(keyOf('duplicate-persons', { email: 'a@x.com', ids: [1, 2] })).toBe(
      'a@x.com',
    )
  })
  it('keys overdue-activities by owner', () => {
    expect(keyOf('overdue-activities', { owner_id: 5, overdue: 3 })).toBe('5')
  })
  it('keys duplicate-orgs by name (exact) or sorted ids (fuzzy)', () => {
    expect(
      keyOf('duplicate-orgs', { kind: 'exact', name: 'acme', ids: [1, 2] }),
    ).toBe('acme')
    expect(
      keyOf('duplicate-orgs', {
        kind: 'fuzzy',
        names: ['A', 'B'],
        ids: [1, 2],
      }),
    ).toBe('1-2')
  })
})

describe('computeNewFindings', () => {
  const results = [
    {
      name: 'stale-deals',
      severity: 'must',
      title: 'Stale',
      count: 2,
      items: [
        { id: 1, title: 'One' },
        { id: 2, title: 'Two' },
      ],
    },
    {
      name: 'duplicate-orgs',
      severity: 'should',
      title: 'Dup orgs',
      count: 1,
      items: [
        { kind: 'note', note: 'skipped fuzzy scan' }, // must be ignored
        { kind: 'exact', name: 'acme', ids: [1, 2] },
      ],
    },
  ]

  it('emits only findings whose key is not in prior state', () => {
    const prior = { 'stale-deals': ['1'] }
    const { newFindings } = computeNewFindings(results, prior)
    const keys = newFindings.map((f) => `${f.check}:${f.key}`)
    expect(keys).toContain('stale-deals:2') // new
    expect(keys).not.toContain('stale-deals:1') // already known
    expect(keys).toContain('duplicate-orgs:acme') // new
  })

  it('never treats a kind:note row as a finding', () => {
    const { newFindings } = computeNewFindings(results, {})
    expect(newFindings.some((f) => f.item.kind === 'note')).toBe(false)
  })

  it('replaces (not unions) per-check state so resolved findings are pruned', () => {
    const prior = { 'stale-deals': ['1', '9'] } // 9 has since resolved
    const { nextState } = computeNewFindings(results, prior)
    expect(nextState['stale-deals'].sort()).toEqual(['1', '2'])
    expect(nextState['stale-deals']).not.toContain('9')
  })

  it('preserves stored state for checks not run this time', () => {
    const prior = { 'missing-fields': ['100'] } // not in results
    const { nextState } = computeNewFindings(results, prior)
    expect(nextState['missing-fields']).toEqual(['100'])
  })

  it('tags each new finding with its check name and severity', () => {
    const { newFindings } = computeNewFindings(results, {})
    const stale = newFindings.find((f) => f.check === 'stale-deals')
    expect(stale).toMatchObject({ severity: 'must' })
    expect(stale.item.id).toBeDefined()
  })

  it('treats absent prior state as everything-new (first run)', () => {
    const { newFindings, nextState } = computeNewFindings(results)
    // 2 stale + 1 org (note excluded)
    expect(newFindings).toHaveLength(3)
    expect(nextState['stale-deals']).toEqual(['1', '2'])
  })
})
