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

const { default: FilterHelpersCommand } =
  await import('../../../src/commands/filter/helpers.js')
import { runCmd, mockApi } from '../../helpers.js'

const HELPERS = {
  operators: {
    varchar: {
      '=': 'is',
      '!=': 'is not',
    },
    date: {
      '=': 'is',
      '>': 'is later than',
    },
    enum: [{ '=': 'is' }, { 'IS NULL': 'is empty' }],
  },
}

describe('filter helpers', () => {
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

  it('flattens operators into type/operator/meaning rows (json)', async () => {
    mockApi()
      .get('/api/v1/filters/helpers')
      .reply(200, { success: true, data: HELPERS })

    const stdout = await runCmd(FilterHelpersCommand, ['--output', 'json'])
    const rows = JSON.parse(stdout)

    expect(
      rows.some(
        (r) => r.type === 'varchar' && r.operator === '=' && r.meaning === 'is',
      ),
    ).toBe(true)
    // The enum array-of-objects shape is flattened too.
    expect(
      rows.some((r) => r.type === 'enum' && r.operator === 'IS NULL'),
    ).toBe(true)
  })

  it('renders a table with the operator columns', async () => {
    mockApi()
      .get('/api/v1/filters/helpers')
      .reply(200, { success: true, data: HELPERS })

    const stdout = await runCmd(FilterHelpersCommand, ['--output', 'table'])
    expect(stdout).toContain('varchar')
    expect(stdout).toContain('is later than')
  })

  it('emits no rows when the helpers payload has no operators', async () => {
    mockApi()
      .get('/api/v1/filters/helpers')
      .reply(200, { success: true, data: {} })

    const stdout = await runCmd(FilterHelpersCommand, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual([])
  })

  it('filters the operators to a single field data type', async () => {
    mockApi()
      .get('/api/v1/filters/helpers')
      .reply(200, { success: true, data: HELPERS })

    const stdout = await runCmd(FilterHelpersCommand, [
      '--type',
      'date',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows.every((r) => r.type === 'date')).toBe(true)
    expect(rows.length).toBe(2)
  })
})
