import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { diffBackups } from '../../src/lib/backup-diff.js'
import { loadBackup } from '../../src/lib/backup.js'

const DEAL_FIELDS = [
  {
    field_code: 'abc123',
    field_name: 'Region',
    field_type: 'enum',
    options: [
      { id: 5, label: 'EMEA' },
      { id: 6, label: 'APAC' },
    ],
  },
]

const A = {
  manifest: { completed: ['deals', 'dealFields'] },
  resources: {
    deals: [
      { id: 1, title: 'Acme', value: 100, custom_fields: { abc123: 5 } },
      { id: 2, title: 'Gone', value: 10 },
    ],
    dealFields: DEAL_FIELDS,
  },
}

const B = {
  manifest: { completed: ['deals', 'dealFields', 'persons'] },
  resources: {
    deals: [
      { id: 1, title: 'Acme', value: 150, custom_fields: { abc123: 6 } },
      { id: 3, title: 'New', value: 20 },
    ],
    dealFields: DEAL_FIELDS,
    persons: [{ id: 1, name: 'P' }],
  },
}

describe('diffBackups', () => {
  it('classifies added, removed, and modified records', () => {
    const { changes } = diffBackups(A, B)
    const types = (id, change) =>
      changes.filter(
        (c) => c.resource === 'deals' && c.id === id && c.change === change,
      )
    expect(types('3', 'added')).toHaveLength(1)
    expect(types('2', 'removed')).toHaveLength(1)
    expect(types('1', 'modified').length).toBeGreaterThan(0)
  })

  it('emits one modified row per changed field with old/new values', () => {
    const { changes } = diffBackups(A, B)
    const value = changes.find(
      (c) => c.resource === 'deals' && c.id === '1' && c.field === 'value',
    )
    expect(value).toMatchObject({
      change: 'modified',
      oldValue: 100,
      newValue: 150,
    })
  })

  it('resolves custom-field hash keys and option labels from the snapshot schema', () => {
    const { changes } = diffBackups(A, B)
    const region = changes.find(
      (c) =>
        c.resource === 'deals' &&
        c.id === '1' &&
        c.field === 'custom_fields.Region',
    )
    expect(region).toMatchObject({ oldValue: 'EMEA', newValue: 'APAC' })
  })

  it('leaves custom fields as raw hash keys/ids when resolveNames is false', () => {
    const { changes } = diffBackups(A, B, { resolveNames: false })
    const raw = changes.find(
      (c) =>
        c.resource === 'deals' &&
        c.id === '1' &&
        c.field === 'custom_fields.abc123',
    )
    expect(raw).toMatchObject({ oldValue: 5, newValue: 6 })
  })

  it('skips resources present in only one snapshot (asymmetric coverage)', () => {
    const { skipped } = diffBackups(A, B)
    expect(skipped).toContainEqual({ resource: 'persons', presentIn: 'B' })
    // deals/dealFields are in both → not skipped
    expect(skipped.map((s) => s.resource)).not.toContain('deals')
  })

  it('summarizes the totals', () => {
    const { summary } = diffBackups(A, B)
    expect(summary.added).toBe(1)
    expect(summary.removed).toBe(1)
    expect(summary.modified).toBe(1) // one record (deal 1)
    expect(summary.fieldsChanged).toBe(2) // value + Region
  })

  it('reports no changes for identical snapshots', () => {
    const { changes, summary } = diffBackups(A, A)
    expect(changes).toEqual([])
    expect(summary).toEqual({
      added: 0,
      removed: 0,
      modified: 0,
      fieldsChanged: 0,
    })
  })

  it('diffs fields added/removed within a record and tolerates null custom_fields', () => {
    const a = {
      resources: {
        persons: [{ id: 1, name: 'P', phone: '111', custom_fields: null }],
      },
    }
    const b = {
      resources: {
        persons: [{ id: 1, name: 'P', email: 'e@x', custom_fields: null }],
      },
    }
    const { changes } = diffBackups(a, b)
    expect(changes.find((c) => c.field === 'phone')).toMatchObject({
      oldValue: '111',
      newValue: null,
    })
    expect(changes.find((c) => c.field === 'email')).toMatchObject({
      oldValue: null,
      newValue: 'e@x',
    })
    // custom_fields null on both sides → unchanged, no row
    expect(changes.find((c) => c.field === 'custom_fields')).toBeUndefined()
  })

  it('resolves names from the older snapshot when the newer lacks the field schema', () => {
    const a = {
      resources: {
        deals: [{ id: 1, custom_fields: { abc123: 5 } }],
        dealFields: DEAL_FIELDS,
      },
    }
    const b = {
      resources: { deals: [{ id: 1, custom_fields: { abc123: 6 } }] },
    }
    const { changes, skipped } = diffBackups(a, b)
    expect(
      changes.find((c) => c.field === 'custom_fields.Region'),
    ).toMatchObject({
      oldValue: 'EMEA',
      newValue: 'APAC',
    })
    expect(skipped).toContainEqual({ resource: 'dealFields', presentIn: 'A' })
  })

  it('handles a missing field schema and an explicitly-undefined resource array', () => {
    const a = { resources: { deals: undefined } }
    const b = { resources: { deals: [{ id: 1, custom_fields: { x: 1 } }] } }
    const { changes } = diffBackups(a, b)
    expect(changes).toContainEqual({
      resource: 'deals',
      id: '1',
      change: 'added',
      field: null,
      oldValue: null,
      newValue: null,
    })
  })

  it('treats a non-object custom_fields as a plain top-level field', () => {
    const a = { resources: { deals: [{ id: 1, custom_fields: 'a' }] } }
    const b = { resources: { deals: [{ id: 1, custom_fields: 'b' }] } }
    const { changes } = diffBackups(a, b, { resolveNames: false })
    expect(changes.find((c) => c.field === 'custom_fields')).toMatchObject({
      oldValue: 'a',
      newValue: 'b',
    })
  })

  it('handles snapshots with no resources object at all', () => {
    const { changes, skipped, summary } = diffBackups({}, {})
    expect(changes).toEqual([])
    expect(skipped).toEqual([])
    expect(summary.added).toBe(0)
  })

  it('coerces ids to strings so integer and string ids compare', () => {
    const a = {
      manifest: {},
      resources: { leads: [{ id: 'uuid-1', title: 'X' }] },
    }
    const b = {
      manifest: {},
      resources: { leads: [{ id: 'uuid-1', title: 'Y' }] },
    }
    const { changes } = diffBackups(a, b)
    expect(changes.find((c) => c.field === 'title')).toMatchObject({
      oldValue: 'X',
      newValue: 'Y',
    })
  })
})

describe('loadBackup', () => {
  it('reads the manifest and each present resource file from a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdcli-bk-'))
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ completed: ['deals'], counts: { deals: 1 } }),
    )
    writeFileSync(join(dir, 'deals.json'), JSON.stringify([{ id: 1 }]))
    const loaded = loadBackup(dir)
    expect(loaded.manifest.completed).toEqual(['deals'])
    expect(loaded.resources.deals).toEqual([{ id: 1 }])
    // a resource file that was never written is simply absent
    expect(loaded.resources.persons).toBeUndefined()
  })

  it('tolerates a directory with no manifest (empty resources)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdcli-bk-empty-'))
    const loaded = loadBackup(dir)
    expect(loaded.resources).toEqual({})
  })

  it('skips a corrupt resource file rather than throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdcli-bk-corrupt-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'deals.json'), '{not json')
    const loaded = loadBackup(dir)
    expect(loaded.resources.deals).toBeUndefined()
  })
})
