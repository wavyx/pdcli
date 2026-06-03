import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: SearchCommand } = await import('../../src/commands/search.js')
import { runCmd, mockApi } from '../helpers.js'

const SEARCH_REPLY = {
  success: true,
  data: {
    items: [
      {
        result_score: 0.9,
        item: { id: 42, type: 'deal', title: 'Acme deal' },
      },
      {
        result_score: 0.5,
        item: { id: 7, type: 'organization', name: 'Acme Corp' },
      },
    ],
  },
}

describe('search', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('searches and flattens items as JSON', async () => {
    mockApi()
      .get('/api/v2/itemSearch')
      .query({ term: 'acme' })
      .reply(200, SEARCH_REPLY)

    const stdout = await runCmd(SearchCommand, ['acme', '--output', 'json'])
    const items = JSON.parse(stdout)

    expect(items).toHaveLength(2)
    expect(items[0].type).toBe('deal')
    expect(items[0].id).toBe(42)
  })

  it('renders a table with type, id, and name/title', async () => {
    mockApi()
      .get('/api/v2/itemSearch')
      .query({ term: 'acme' })
      .reply(200, SEARCH_REPLY)

    const stdout = await runCmd(SearchCommand, ['acme', '--output', 'table'])

    expect(stdout).toContain('deal')
    expect(stdout).toContain('Acme deal')
    expect(stdout).toContain('Acme Corp')
  })

  it('passes item-types and exact flags as query params', async () => {
    mockApi()
      .get('/api/v2/itemSearch')
      .query({
        term: 'acme',
        item_types: 'deal,person',
        exact_match: 'true',
        limit: '10',
      })
      .reply(200, { success: true, data: { items: [] } })

    const stdout = await runCmd(SearchCommand, [
      'acme',
      '--item-types',
      'deal,person',
      '--exact',
      '--limit',
      '10',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('rejects a term shorter than 2 characters', async () => {
    await expect(SearchCommand.run(['a'])).rejects.toThrow(/2 characters/)
  })

  it('allows a 1-character term with --exact', async () => {
    mockApi()
      .get('/api/v2/itemSearch')
      .query({ term: 'a', exact_match: 'true' })
      .reply(200, { success: true, data: { items: [] } })

    const stdout = await runCmd(SearchCommand, [
      'a',
      '--exact',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual([])
  })
})

describe('search edge cases', () => {
  it('renders blank names for items without title or name', async () => {
    mockApi()
      .get('/api/v2/itemSearch')
      .query({ term: 'acme' })
      .reply(200, {
        success: true,
        data: { items: [{ result_score: 0.1, item: { id: 1, type: 'file' } }] },
      })

    const stdout = await runCmd(SearchCommand, ['acme', '--output', 'table'])

    expect(stdout).toContain('file')
  })

  it('handles a null data payload', async () => {
    mockApi()
      .get('/api/v2/itemSearch')
      .query({ term: 'acme' })
      .reply(200, { success: true, data: null })

    const stdout = await runCmd(SearchCommand, ['acme', '--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([])
  })
})
