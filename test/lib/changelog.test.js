import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchChangelog, mineMany } from '../../src/lib/changelog.js'
import { ApiError } from '../../src/lib/errors.js'

/**
 * A fake apiClient whose pageV2 replays canned pages per path. Each path maps
 * to an array of pages; every page is `{ data, next_cursor }`. Mirrors the
 * flat-cursor changelog shape (additional_data.next_cursor on a v1 path).
 */
function fakeClient(pagesByPath) {
  const calls = []
  return {
    calls,
    async *pageV2(path, query = {}) {
      calls.push({ path, query })
      const pages = pagesByPath[path] ?? [{ data: [], next_cursor: null }]
      for (const page of pages) {
        yield* page.data
      }
    },
  }
}

describe('fetchChangelog', () => {
  it('fetches changelog rows for a deal via pageV2 over the v1 changelog path', async () => {
    const client = fakeClient({
      '/api/v1/deals/7/changelog': [
        {
          data: [
            { field_key: 'stage_id', old_value: '1', new_value: '2' },
            { field_key: 'status', old_value: 'open', new_value: 'won' },
          ],
          next_cursor: null,
        },
      ],
    })

    const rows = await fetchChangelog(client, 7)

    expect(rows).toEqual([
      { field_key: 'stage_id', old_value: '1', new_value: '2' },
      { field_key: 'status', old_value: 'open', new_value: 'won' },
    ])
    expect(client.calls[0].path).toBe('/api/v1/deals/7/changelog')
  })

  it('passes the limit through to the pager query', async () => {
    const client = fakeClient({
      '/api/v1/deals/7/changelog': [{ data: [], next_cursor: null }],
    })

    await fetchChangelog(client, 7, { limit: 250 })

    expect(client.calls[0].query).toMatchObject({ limit: 250 })
  })

  it('defaults to the max page limit when no limit is given', async () => {
    const client = fakeClient({
      '/api/v1/deals/7/changelog': [{ data: [], next_cursor: null }],
    })

    await fetchChangelog(client, 7)

    expect(client.calls[0].query).toMatchObject({ limit: 500 })
  })

  it('stops collecting once the limit is reached instead of walking every page', async () => {
    // Three full pages are available, but a limit of 2 must bound the work:
    // collection should stop after the cap, leaving later pages unyielded.
    let yielded = 0
    const client = {
      calls: [],
      async *pageV2(path, query = {}) {
        this.calls.push({ path, query })
        for (let page = 0; page < 3; page++) {
          for (const row of [
            { field_key: 'stage_id', old_value: String(page), new_value: 'x' },
            { field_key: 'status', old_value: String(page), new_value: 'y' },
          ]) {
            yielded++
            yield row
          }
        }
      },
    }

    const rows = await fetchChangelog(client, 7, { limit: 2 })

    expect(rows).toHaveLength(2)
    expect(yielded).toBe(2)
  })
})

describe('mineMany', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function spyStderr() {
    const chunks = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk))
      return true
    })
    return chunks
  }

  it('returns one transitions entry per deal carrying dealId, stageId, and rows', async () => {
    const client = fakeClient({
      '/api/v1/deals/10/changelog': [
        { data: [{ field_key: 'stage_id', old_value: '1', new_value: '2' }] },
      ],
      '/api/v1/deals/11/changelog': [{ data: [] }],
    })

    const result = await mineMany(client, [
      { id: 10, stage_id: 2 },
      { id: 11, stage_id: 1 },
    ])

    expect(result).toEqual([
      {
        dealId: 10,
        stageId: 2,
        rows: [{ field_key: 'stage_id', old_value: '1', new_value: '2' }],
      },
      { dealId: 11, stageId: 1, rows: [] },
    ])
  })

  it('warns on stderr with the estimated request count when over the threshold', async () => {
    const deals = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      stage_id: 1,
    }))
    const pagesByPath = {}
    for (const d of deals) {
      pagesByPath[`/api/v1/deals/${d.id}/changelog`] = [{ data: [] }]
    }
    const client = fakeClient(pagesByPath)

    const chunks = spyStderr()
    await mineMany(client, deals)

    const text = chunks.join('')
    expect(text).toMatch(/101 deals/)
    expect(text).toMatch(/request/i)
  })

  it('does not warn when mining at or below the threshold', async () => {
    const client = fakeClient({
      '/api/v1/deals/1/changelog': [{ data: [] }],
    })

    const chunks = spyStderr()
    await mineMany(client, [{ id: 1, stage_id: 1 }])

    expect(chunks.join('')).not.toMatch(/deals/)
  })

  it('skips deals whose changelog throws an ApiError and warns once after mining', async () => {
    const client = {
      async *pageV2(path) {
        if (path === '/api/v1/deals/41/changelog') {
          throw new ApiError(404, { error: 'Deal not found' }, path)
        }
        if (path === '/api/v1/deals/42/changelog') {
          throw new ApiError(500, { error: 'Server error' }, path)
        }
        yield { field_key: 'stage_id', old_value: '1', new_value: '2' }
      },
    }

    const chunks = spyStderr()
    const result = await mineMany(client, [
      { id: 40, stage_id: 2 },
      { id: 41, stage_id: 1 },
      { id: 42, stage_id: 1 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].dealId).toBe(40)

    const text = chunks.join('')
    expect(text).toMatch(
      /skipped 2 deal\(s\) whose changelog could not be fetched/,
    )
    const warnings = text
      .split('\n')
      .filter((l) => /could not be fetched/.test(l))
    expect(warnings).toHaveLength(1)
  })

  it('rethrows non-ApiError failures instead of skipping them', async () => {
    const client = {
      // eslint-disable-next-line require-yield
      async *pageV2() {
        throw new Error('socket hangup')
      },
    }

    await expect(mineMany(client, [{ id: 60, stage_id: 1 }])).rejects.toThrow(
      'socket hangup',
    )
  })

  it('honors a custom warn threshold and request cost in the warning text', async () => {
    const deals = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      stage_id: 1,
    }))
    const pagesByPath = {}
    for (const d of deals) {
      pagesByPath[`/api/v1/deals/${d.id}/changelog`] = [{ data: [] }]
    }
    const client = fakeClient(pagesByPath)

    const chunks = spyStderr()
    await mineMany(client, deals, { warnThreshold: 2, costPerRequest: 99 })

    const text = chunks.join('')
    expect(text).toMatch(/3 deals/)
    expect(text).toMatch(/99 tokens/)
  })
})
