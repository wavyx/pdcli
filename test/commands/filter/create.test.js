import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'

const mockResolveCredentials = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const { default: FilterCreateCommand } =
  await import('../../../src/commands/filter/create.js')
import { runCmd, mockApi } from '../../helpers.js'

const CONDITIONS = {
  glue: 'and',
  conditions: [
    {
      glue: 'and',
      conditions: [
        { object: 'deal', field_id: '123', operator: '=', value: 'x' },
      ],
    },
    { glue: 'or', conditions: [] },
  ],
}

describe('filter create', () => {
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

  it('POSTs name, type and inline conditions JSON', async () => {
    mockApi()
      .post('/api/v1/filters', {
        name: 'Open deals',
        type: 'deals',
        conditions: CONDITIONS,
      })
      .reply(201, {
        success: true,
        data: { id: 42, name: 'Open deals', type: 'deals' },
      })

    const stdout = await runCmd(FilterCreateCommand, [
      '--name',
      'Open deals',
      '--type',
      'deals',
      '--conditions',
      JSON.stringify(CONDITIONS),
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(42)
  })

  it('reads conditions from an @file', async () => {
    const file = join(tmpdir(), `pdcli-filter-${Date.now()}.json`)
    writeFileSync(file, JSON.stringify(CONDITIONS))

    mockApi()
      .post('/api/v1/filters', {
        name: 'From file',
        type: 'deals',
        conditions: CONDITIONS,
      })
      .reply(201, { success: true, data: { id: 43 } })

    try {
      const stdout = await runCmd(FilterCreateCommand, [
        '--name',
        'From file',
        '--type',
        'deals',
        '--conditions',
        `@${file}`,
        '--output',
        'json',
      ])
      expect(JSON.parse(stdout).id).toBe(43)
    } finally {
      rmSync(file, { force: true })
    }
  })

  it('rejects malformed conditions JSON with exit 65', async () => {
    const err = await FilterCreateCommand.run([
      '--name',
      'Bad',
      '--type',
      'deals',
      '--conditions',
      '{not json',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
  })

  it('rejects an unknown --type with exit 64', async () => {
    const err = await FilterCreateCommand.run([
      '--name',
      'X',
      '--type',
      'contacts',
      '--conditions',
      '{}',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('requires --name', async () => {
    const err = await FilterCreateCommand.run([
      '--type',
      'deals',
      '--conditions',
      '{}',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })
})
