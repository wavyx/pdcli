import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: BackupDiffCommand } =
  await import('../../../src/commands/backup/diff.js')
import { runCmd } from '../../helpers.js'

const DEAL_FIELDS = [
  {
    field_code: 'abc',
    field_name: 'Region',
    field_type: 'enum',
    options: [
      { id: 5, label: 'EMEA' },
      { id: 6, label: 'APAC' },
    ],
  },
]

function writeBackup(deals) {
  const dir = mkdtempSync(join(tmpdir(), 'pdcli-diff-'))
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ completed: ['deals', 'dealFields'] }),
  )
  writeFileSync(join(dir, 'deals.json'), JSON.stringify(deals))
  writeFileSync(join(dir, 'dealFields.json'), JSON.stringify(DEAL_FIELDS))
  return dir
}

const A = () =>
  writeBackup([
    {
      id: 1,
      title: 'Acme',
      value: 100,
      label_ids: [1, 2],
      custom_fields: { abc: 5 },
    },
    { id: 2, title: 'Gone', value: 10 },
  ])
const B = () =>
  writeBackup([
    {
      id: 1,
      title: 'Acme',
      value: 150,
      label_ids: [1, 3],
      custom_fields: { abc: 6 },
    },
    { id: 3, title: 'New', value: 20 },
  ])

describe('backup diff', () => {
  it('emits a structured diff (added/removed/modified + resolved fields) as JSON', async () => {
    const stdout = await runCmd(BackupDiffCommand, [
      A(),
      B(),
      '--output',
      'json',
    ])
    const d = JSON.parse(stdout)
    expect(d.summary).toMatchObject({ added: 1, removed: 1, modified: 1 })
    const region = d.changes.find((c) => c.field === 'custom_fields.Region')
    expect(region).toMatchObject({ oldValue: 'EMEA', newValue: 'APAC' })
  })

  it('renders a table with a summary line', async () => {
    const stdout = await runCmd(BackupDiffCommand, [
      A(),
      B(),
      '--output',
      'table',
    ])
    expect(stdout).toContain('Region')
    expect(stdout).toContain('EMEA')
    expect(stdout).toContain('APAC')
    expect(stdout.toLowerCase()).toMatch(/added/)
  })

  it('leaves custom fields raw with --raw', async () => {
    const stdout = await runCmd(BackupDiffCommand, [
      A(),
      B(),
      '--raw',
      '--output',
      'json',
    ])
    const d = JSON.parse(stdout)
    expect(d.changes.find((c) => c.field === 'custom_fields.abc')).toBeDefined()
  })

  it('notes resources present in only one snapshot in the table', async () => {
    // A has an extra persons.json that B lacks → reported as skipped.
    const a = A()
    writeFileSync(
      join(a, 'persons.json'),
      JSON.stringify([{ id: 1, name: 'P' }]),
    )
    const stdout = await runCmd(BackupDiffCommand, [
      a,
      B(),
      '--output',
      'table',
    ])
    expect(stdout).toMatch(/Skipped/i)
    expect(stdout).toContain('persons')
  })

  it('errors with exit 64 when a path is not a backup directory', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'pdcli-empty-'))
    const err = await BackupDiffCommand.run([empty, B()]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/not a .*backup/i)
  })
})
