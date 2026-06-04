import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { Readable } from 'node:stream'
import { createClient } from '../../src/lib/client.js'
import { resolveTargets, bulkRun } from '../../src/lib/bulk.js'

const API_BASE = 'https://acme.pipedrive.com'

function client() {
  return createClient({
    companyDomain: 'acme',
    token: 'tok',
    retry: false,
    timeout: 5000,
  })
}

describe('resolveTargets', () => {
  beforeEach(() => nock.cleanAll())
  afterEach(() => nock.cleanAll())

  it('parses a comma-separated --ids list', async () => {
    const ids = await resolveTargets(
      { ids: '1, 2,3' },
      client(),
      '/api/v2/deals',
    )
    expect(ids).toEqual([1, 2, 3])
  })

  it('fetches ids for a --filter via filter_id', async () => {
    nock(API_BASE)
      .get('/api/v2/deals')
      .query({ filter_id: '9', limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 7 }, { id: 8 }],
        additional_data: { next_cursor: null },
      })

    const ids = await resolveTargets({ filter: 9 }, client(), '/api/v2/deals')
    expect(ids).toEqual([7, 8])
  })

  it('reads newline-separated ids from piped stdin', async () => {
    const stdin = Readable.from([Buffer.from('4\n5\n6\n')])
    stdin.isTTY = false
    const ids = await resolveTargets({ stdin }, client(), '/api/v2/deals')
    expect(ids).toEqual([4, 5, 6])
  })

  it('reads a JSON array from piped stdin', async () => {
    const stdin = Readable.from([Buffer.from('[10, 11]')])
    stdin.isTTY = false
    const ids = await resolveTargets({ stdin }, client(), '/api/v2/deals')
    expect(ids).toEqual([10, 11])
  })

  it('reads JSON objects with ids from piped stdin', async () => {
    const stdin = Readable.from([Buffer.from('[{"id": 12}, {"id": 13}]')])
    stdin.isTTY = false
    const ids = await resolveTargets({ stdin }, client(), '/api/v2/deals')
    expect(ids).toEqual([12, 13])
  })

  it('throws 64 when no selector is given', async () => {
    const stdin = { isTTY: true }
    await expect(
      resolveTargets({ stdin }, client(), '/api/v2/deals'),
    ).rejects.toMatchObject({ exitCode: 64 })
  })

  it('throws 64 on unparseable ids', async () => {
    await expect(
      resolveTargets({ ids: '1,abc' }, client(), '/api/v2/deals'),
    ).rejects.toMatchObject({ exitCode: 64 })
  })
})

describe('bulkRun', () => {
  it('runs the operation per item and collects successes', async () => {
    const seen = []
    const result = await bulkRun(
      [1, 2, 3],
      async (id) => {
        seen.push(id)
        return { id }
      },
      { gapMs: 0 },
    )

    expect(seen).toEqual([1, 2, 3])
    expect(result.succeeded).toHaveLength(3)
    expect(result.failed).toHaveLength(0)
  })

  it('continues past failures and reports them per item', async () => {
    const result = await bulkRun(
      [1, 2, 3],
      async (id) => {
        if (id === 2) throw new Error('boom on 2')
        return { id }
      },
      { gapMs: 0 },
    )

    expect(result.succeeded.map((s) => s.item)).toEqual([1, 3])
    expect(result.failed).toEqual([{ item: 2, error: 'boom on 2' }])
  })

  it('reports progress per item', async () => {
    const progress = []
    await bulkRun([1, 2], async () => ({}), {
      gapMs: 0,
      onProgress: (done, total) => progress.push(`${done}/${total}`),
    })
    expect(progress).toEqual(['1/2', '2/2'])
  })

  it('paces requests with the configured gap', async () => {
    vi.useFakeTimers()
    try {
      const done = []
      const promise = bulkRun(
        [1, 2],
        async (id) => {
          done.push(id)
        },
        { gapMs: 200 },
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(done).toEqual([1])
      await vi.advanceTimersByTimeAsync(200)
      await promise
      expect(done).toEqual([1, 2])
    } finally {
      vi.useRealTimers()
    }
  })
})
