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

const { default: FilterUpdateCommand } =
  await import('../../../src/commands/filter/update.js')
import { runCmd, mockApi } from '../../helpers.js'

const CONDITIONS = {
  glue: 'and',
  conditions: [
    { glue: 'and', conditions: [] },
    { glue: 'or', conditions: [] },
  ],
}

describe('filter update', () => {
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

  it('PUTs the name only', async () => {
    mockApi()
      .put('/api/v1/filters/5', { name: 'Renamed' })
      .reply(200, { success: true, data: { id: 5, name: 'Renamed' } })

    const stdout = await runCmd(FilterUpdateCommand, [
      '5',
      '--name',
      'Renamed',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).name).toBe('Renamed')
  })

  it('PUTs updated conditions from inline JSON', async () => {
    mockApi()
      .put('/api/v1/filters/5', { conditions: CONDITIONS })
      .reply(200, { success: true, data: { id: 5 } })

    const stdout = await runCmd(FilterUpdateCommand, [
      '5',
      '--conditions',
      JSON.stringify(CONDITIONS),
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(5)
  })

  it('errors with exit 64 when nothing is provided', async () => {
    const err = await FilterUpdateCommand.run(['5']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('rejects malformed conditions JSON with exit 65', async () => {
    const err = await FilterUpdateCommand.run([
      '5',
      '--conditions',
      '{bad',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
  })

  it('requires the id arg', async () => {
    const err = await FilterUpdateCommand.run(['--name', 'X']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })
})
