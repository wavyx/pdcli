import { describe, it, expect } from 'vitest'
import { resolvePipeline } from '../../src/lib/pipelines.js'

/** Minimal fake client: returns a canned /api/v2/pipelines envelope. */
function fakeClient(pipelines) {
  return {
    calls: 0,
    async get(path) {
      this.calls++
      expect(path).toBe('/api/v2/pipelines')
      return pipelines === undefined ? { success: true } : { data: pipelines }
    },
  }
}

describe('resolvePipeline', () => {
  it('returns the explicit flag without calling the API', async () => {
    const client = fakeClient([])
    expect(await resolvePipeline(client, 7)).toBe(7)
    expect(client.calls).toBe(0)
  })

  it('auto-picks the only pipeline when no flag is given', async () => {
    const client = fakeClient([{ id: 3, name: 'Sales' }])
    expect(await resolvePipeline(client, undefined)).toBe(3)
    expect(client.calls).toBe(1)
  })

  it('throws exit 64 listing pipelines when several exist and no flag', async () => {
    const client = fakeClient([
      { id: 1, name: 'Sales' },
      { id: 2, name: 'Partners' },
    ])
    let caught
    try {
      await resolvePipeline(client, undefined)
    } catch (err) {
      caught = err
    }
    expect(caught.exitCode).toBe(64)
    expect(caught.message).toMatch(/--pipeline/)
    expect(caught.message).toMatch(/1=Sales/)
    expect(caught.message).toMatch(/2=Partners/)
  })

  it('returns undefined when the account has no pipelines', async () => {
    const client = fakeClient([])
    expect(await resolvePipeline(client, undefined)).toBeUndefined()
  })

  it('treats a missing data array as no pipelines', async () => {
    const client = fakeClient(undefined)
    expect(await resolvePipeline(client, null)).toBeUndefined()
  })
})
