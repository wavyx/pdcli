import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mockResolveCredentials = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})
vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: SyncWarehouseCommand } =
  await import('../../../src/commands/sync/warehouse.js')
import { INCREMENTAL_ENTITIES } from '../../../src/lib/warehouse.js'
import { runCmd, mockApi } from '../../helpers.js'

function mockAll(data = {}, cap = {}) {
  for (const { name, path } of INCREMENTAL_ENTITIES) {
    mockApi()
      .get(path)
      .query((q) => {
        cap[name] = q
        return true
      })
      .reply(200, {
        success: true,
        data: data[name] ?? [],
        additional_data: { next_cursor: null },
      })
  }
}

let dir
describe('sync warehouse', () => {
  beforeEach(() => {
    nock.cleanAll()
    dir = mkdtempSync(join(tmpdir(), 'pdcli-syncwh-'))
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })
  afterEach(() => nock.cleanAll())

  it('writes per-entity NDJSON + a manifest and reports counts (JSON)', async () => {
    mockAll({ deals: [{ id: 1, update_time: '2026-06-10T00:00:00Z' }] })
    const stdout = await runCmd(SyncWarehouseCommand, [
      '--dir',
      dir,
      '--output',
      'json',
    ])
    const result = JSON.parse(stdout)
    expect(result.counts.deals).toBe(1)
    expect(existsSync(join(dir, 'deals.ndjson'))).toBe(true)
    expect(existsSync(join(dir, 'manifest.json'))).toBe(true)
    const line = readFileSync(join(dir, 'deals.ndjson'), 'utf8').trim()
    expect(JSON.parse(line).id).toBe(1)
  })

  it('passes a resolved --since to every entity query', async () => {
    const cap = {}
    mockAll({}, cap)
    await runCmd(SyncWarehouseCommand, [
      '--dir',
      dir,
      '--since',
      '7d',
      '--output',
      'json',
    ])
    for (const { name } of INCREMENTAL_ENTITIES) {
      expect(cap[name].updated_since).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('errors with exit 64 on a bad --since', async () => {
    const err = await SyncWarehouseCommand.run([
      '--dir',
      dir,
      '--since',
      'whenever',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('renders a summary in table mode', async () => {
    mockAll({ deals: [{ id: 1, update_time: '2026-06-10T00:00:00Z' }] })
    const stdout = await runCmd(SyncWarehouseCommand, [
      '--dir',
      dir,
      '--output',
      'table',
    ])
    expect(stdout).toContain('Synced')
    expect(stdout).toContain('deals: 1')
  })
})
