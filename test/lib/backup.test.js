import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '../../src/lib/client.js'
import { runBackup, BACKUP_RESOURCES } from '../../src/lib/backup.js'

const API_BASE = 'https://acme.pipedrive.com'

function client() {
  return createClient({
    companyDomain: 'acme',
    token: 'tok',
    retry: false,
    timeout: 5000,
  })
}

/** nock every backup resource with a small payload */
function mockAll() {
  for (const r of BACKUP_RESOURCES) {
    if (r.pager === 'v2') {
      nock(API_BASE)
        .get(r.path)
        .query(true)
        .reply(200, {
          success: true,
          data: [{ id: 1, resource: r.name }],
          additional_data: { next_cursor: null },
        })
    } else if (r.pager === 'v1') {
      nock(API_BASE)
        .get(r.path)
        .query(true)
        .reply(200, {
          success: true,
          data: [{ id: 1, resource: r.name }],
          additional_data: {
            pagination: { more_items_in_collection: false },
          },
        })
    } else {
      nock(API_BASE)
        .get(r.path)
        .query(true)
        .reply(200, { success: true, data: [{ id: 1, resource: r.name }] })
    }
  }
}

describe('runBackup', () => {
  let dir

  beforeEach(() => {
    nock.cleanAll()
    dir = mkdtempSync(join(tmpdir(), 'pdcli-backup-'))
  })

  afterEach(() => {
    nock.cleanAll()
    rmSync(dir, { recursive: true, force: true })
  })

  it('exports every resource to a JSON file and writes a manifest', async () => {
    mockAll()
    const progress = []

    const summary = await runBackup(client(), dir, {
      onProgress: (r, count) => progress.push(`${r}:${count}`),
    })

    for (const r of BACKUP_RESOURCES) {
      const file = join(dir, `${r.name}.json`)
      expect(existsSync(file)).toBe(true)
      const data = JSON.parse(readFileSync(file, 'utf8'))
      expect(data[0].resource).toBe(r.name)
    }

    const manifest = JSON.parse(
      readFileSync(join(dir, 'manifest.json'), 'utf8'),
    )
    expect(manifest.completed).toHaveLength(BACKUP_RESOURCES.length)
    expect(manifest.counts.deals).toBe(1)
    expect(summary.total).toBe(BACKUP_RESOURCES.length)
    expect(summary.skipped).toBe(0)
    expect(progress.length).toBe(BACKUP_RESOURCES.length)
  })

  it('resumes: skips resources already in the manifest', async () => {
    mockAll()
    await runBackup(client(), dir, {})

    // Second run with resume: nothing mocked — must not hit the network.
    nock.cleanAll()
    nock.disableNetConnect()
    try {
      const summary = await runBackup(client(), dir, { resume: true })
      expect(summary.skipped).toBe(BACKUP_RESOURCES.length)
      expect(summary.exported).toBe(0)
    } finally {
      nock.enableNetConnect()
    }
  })

  it('without resume, re-exports everything', async () => {
    mockAll()
    await runBackup(client(), dir, {})
    mockAll()
    const summary = await runBackup(client(), dir, {})
    expect(summary.exported).toBe(BACKUP_RESOURCES.length)
  })

  it('keeps the checkpoint when a resource fails mid-run', async () => {
    // Mock only the first resource; the second will 500.
    const [first, second] = BACKUP_RESOURCES
    nock(API_BASE)
      .get(first.path)
      .query(true)
      .reply(200, {
        success: true,
        data: [{ id: 1, resource: first.name }],
        additional_data: { next_cursor: null },
      })
    nock(API_BASE)
      .get(second.path)
      .query(true)
      .reply(500, { success: false, error: 'boom' })

    await expect(runBackup(client(), dir, {})).rejects.toThrow()

    const manifest = JSON.parse(
      readFileSync(join(dir, 'manifest.json'), 'utf8'),
    )
    expect(manifest.completed).toContain(first.name)
    expect(manifest.completed).not.toContain(second.name)
  })
})
