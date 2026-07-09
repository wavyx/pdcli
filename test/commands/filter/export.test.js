import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: FilterExportCommand } =
  await import('../../../src/commands/filter/export.js')
import { runCmd, mockApi } from '../../helpers.js'

const CONDITIONS = {
  glue: 'and',
  conditions: [
    { glue: 'and', conditions: [] },
    { glue: 'or', conditions: [] },
  ],
}

describe('filter export', () => {
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

  it('exports a single filter as a create-shaped object', async () => {
    mockApi()
      .get('/api/v1/filters/5')
      .reply(200, {
        success: true,
        data: {
          id: 5,
          name: 'Open deals',
          type: 'deals',
          user_id: 99,
          conditions: CONDITIONS,
        },
      })

    const stdout = await runCmd(FilterExportCommand, ['5'])
    const out = JSON.parse(stdout)

    expect(out).toEqual({
      name: 'Open deals',
      type: 'deals',
      conditions: CONDITIONS,
    })
  })

  it('exports every filter with --all', async () => {
    mockApi()
      .get('/api/v1/filters')
      .reply(200, {
        success: true,
        data: [
          { id: 5, name: 'A', type: 'deals' },
          { id: 6, name: 'B', type: 'people' },
        ],
      })
    mockApi()
      .get('/api/v1/filters/5')
      .reply(200, {
        success: true,
        data: { id: 5, name: 'A', type: 'deals', conditions: CONDITIONS },
      })
    mockApi()
      .get('/api/v1/filters/6')
      .reply(200, {
        success: true,
        data: { id: 6, name: 'B', type: 'people', conditions: CONDITIONS },
      })

    const stdout = await runCmd(FilterExportCommand, ['--all'])
    const out = JSON.parse(stdout)

    expect(out).toEqual([
      { name: 'A', type: 'deals', conditions: CONDITIONS },
      { name: 'B', type: 'people', conditions: CONDITIONS },
    ])
  })

  it('emits an empty array when --all finds no filters', async () => {
    mockApi().get('/api/v1/filters').reply(200, { success: true })

    const stdout = await runCmd(FilterExportCommand, ['--all'])
    expect(JSON.parse(stdout)).toEqual([])
  })

  it('honors --jq over the exported object', async () => {
    mockApi()
      .get('/api/v1/filters/5')
      .reply(200, {
        success: true,
        data: { id: 5, name: 'Open deals', type: 'deals', conditions: {} },
      })

    const stdout = await runCmd(FilterExportCommand, [
      '5',
      '--jq',
      '.name',
      '--output',
      'json',
    ])

    expect(stdout.trim()).toBe('"Open deals"')
  })

  it('errors with exit 64 when neither id nor --all is given', async () => {
    const err = await FilterExportCommand.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })
})
