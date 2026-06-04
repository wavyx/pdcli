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

const mockConfirmAction = vi.fn()
vi.mock('../../../src/lib/confirm.js', () => ({
  confirmAction: mockConfirmAction,
}))

const { default: BulkUpdateCommand } =
  await import('../../../src/commands/deal/bulk-update.js')
import { runCmd, mockApi } from '../../helpers.js'

describe('deal bulk-update', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockConfirmAction.mockReset()
    mockConfirmAction.mockResolvedValue(true)
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('PATCHes every id from --ids and reports the summary', async () => {
    for (const id of [1, 2, 3]) {
      mockApi()
        .patch(`/api/v2/deals/${id}`, { stage_id: 5 })
        .reply(200, { success: true, data: { id } })
    }

    const stdout = await runCmd(BulkUpdateCommand, [
      '--ids',
      '1,2,3',
      '--stage',
      '5',
      '--yes',
    ])

    expect(stdout).toContain('3/3')
  })

  it('resolves targets from --filter before updating', async () => {
    mockApi()
      .get('/api/v2/deals')
      .query({ filter_id: '9', limit: '500' })
      .reply(200, {
        success: true,
        data: [{ id: 7 }],
        additional_data: { next_cursor: null },
      })
    mockApi()
      .patch('/api/v2/deals/7', { status: 'won' })
      .reply(200, { success: true, data: { id: 7 } })

    const stdout = await runCmd(BulkUpdateCommand, [
      '--filter',
      '9',
      '--status',
      'won',
      '--yes',
    ])

    expect(stdout).toContain('1/1')
  })

  it('continues past per-deal failures, lists them, and exits 1', async () => {
    mockApi()
      .patch('/api/v2/deals/1', { stage_id: 5 })
      .reply(200, { success: true, data: { id: 1 } })
    mockApi()
      .patch('/api/v2/deals/2', { stage_id: 5 })
      .reply(400, { success: false, error: 'stage not in pipeline' })

    await expect(
      BulkUpdateCommand.run(['--ids', '1,2', '--stage', '5', '--yes']),
    ).rejects.toThrow(/1 of 2 updates failed/i)
  })

  it('--dry-run lists targets without touching the API', async () => {
    nock.disableNetConnect()
    try {
      const stdout = await runCmd(BulkUpdateCommand, [
        '--ids',
        '1,2,3',
        '--stage',
        '5',
        '--dry-run',
      ])
      expect(stdout).toContain('3 deals')
      expect(stdout).toContain('1, 2, 3')
    } finally {
      nock.enableNetConnect()
    }
  })

  it('asks for confirmation and aborts when declined', async () => {
    mockConfirmAction.mockResolvedValue(false)
    nock.disableNetConnect()
    try {
      await expect(
        BulkUpdateCommand.run(['--ids', '1,2', '--stage', '5']),
      ).rejects.toThrow(/abort/i)
      expect(mockConfirmAction).toHaveBeenCalledWith(
        expect.stringContaining('2 deals'),
        false,
      )
    } finally {
      nock.enableNetConnect()
    }
  })

  it('rejects when no change flags are given (exit 64)', async () => {
    await expect(
      BulkUpdateCommand.run(['--ids', '1,2', '--yes']),
    ).rejects.toThrow(/nothing to update/i)
  })
})
