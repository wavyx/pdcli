import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolveCredentials = vi.fn()
vi.mock('../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

vi.mock('../../src/lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ activeProfile: 'default' }),
}))

const mockRunBackup = vi.fn()
vi.mock('../../src/lib/backup.js', () => ({
  runBackup: mockRunBackup,
  BACKUP_RESOURCES: [{ name: 'deals' }],
}))

const { default: BackupCommand } = await import('../../src/commands/backup.js')
import { runCmd } from '../helpers.js'

describe('backup', () => {
  beforeEach(() => {
    mockRunBackup.mockReset()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  it('runs the backup into the given directory and prints a summary', async () => {
    mockRunBackup.mockResolvedValue({
      total: 18,
      exported: 18,
      skipped: 0,
      counts: { deals: 5 },
    })

    const stdout = await runCmd(BackupCommand, ['--dir', '/tmp/pd-backup'])

    expect(mockRunBackup).toHaveBeenCalledWith(
      expect.anything(),
      '/tmp/pd-backup',
      expect.objectContaining({ resume: false }),
    )
    expect(stdout).toContain('18')
    expect(stdout).toContain('/tmp/pd-backup')
  })

  it('passes --resume through and reports skips', async () => {
    mockRunBackup.mockResolvedValue({
      total: 18,
      exported: 2,
      skipped: 16,
      counts: {},
    })

    const stdout = await runCmd(BackupCommand, [
      '--dir',
      '/tmp/pd-backup',
      '--resume',
    ])

    expect(mockRunBackup).toHaveBeenCalledWith(
      expect.anything(),
      '/tmp/pd-backup',
      expect.objectContaining({ resume: true }),
    )
    expect(stdout).toContain('16 skipped')
  })

  it('defaults the directory to ./pipedrive-backup', async () => {
    mockRunBackup.mockResolvedValue({
      total: 18,
      exported: 18,
      skipped: 0,
      counts: {},
    })

    await runCmd(BackupCommand)

    expect(mockRunBackup).toHaveBeenCalledWith(
      expect.anything(),
      'pipedrive-backup',
      expect.anything(),
    )
  })
})

describe('backup progress reporting', () => {
  it('updates the spinner via onProgress', async () => {
    mockRunBackup.mockImplementation(async (client, dir, opts) => {
      opts.onProgress('deals', 5)
      return { total: 1, exported: 1, skipped: 0, counts: { deals: 5 } }
    })

    const stdout = await runCmd(BackupCommand, ['--dir', '/tmp/x'])

    expect(stdout).toContain('1/1')
  })
})
