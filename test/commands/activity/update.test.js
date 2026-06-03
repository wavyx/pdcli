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

const { default: ActivityUpdateCommand } =
  await import('../../../src/commands/activity/update.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('activity update', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockResolveCredentials.mockResolvedValue({
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('PATCHes only the provided flags', async () => {
    mockApi()
      .patch('/api/v2/activities/9', { subject: 'Renamed' })
      .reply(200, {
        success: true,
        data: { id: 9, subject: 'Renamed' },
      })

    const stdout = await runCmd(ActivityUpdateCommand, [
      '9',
      '--subject',
      'Renamed',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).subject).toBe('Renamed')
  })

  it('marks the activity done with --done', async () => {
    mockApi()
      .patch('/api/v2/activities/9', { done: true })
      .reply(200, { success: true, data: { id: 9, done: true } })

    const stdout = await runCmd(ActivityUpdateCommand, [
      '9',
      '--done',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).done).toBe(true)
  })

  it('marks the activity not done with --undone', async () => {
    mockApi()
      .patch('/api/v2/activities/9', { done: false })
      .reply(200, { success: true, data: { id: 9, done: false } })

    const stdout = await runCmd(ActivityUpdateCommand, [
      '9',
      '--undone',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).done).toBe(false)
  })

  it('resolves --field custom fields into custom_fields', async () => {
    mockApi()
      .get('/api/v2/activityFields')
      .reply(200, {
        success: true,
        data: [
          {
            id: 2,
            field_code: HASH,
            field_name: 'Outcome',
            field_type: 'enum',
            is_custom_field: true,
            options: [{ id: 11, label: 'Negative' }],
          },
        ],
      })
    mockApi()
      .patch('/api/v2/activities/9', {
        custom_fields: { [HASH]: 11 },
      })
      .reply(200, {
        success: true,
        data: { id: 9, subject: 'Demo' },
      })

    const stdout = await runCmd(ActivityUpdateCommand, [
      '9',
      '--field',
      'Outcome=Negative',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(9)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .patch('/api/v2/activities/9', {
        subject: 'Flag wins',
        priority: 5,
      })
      .reply(200, { success: true, data: { id: 9 } })

    const stdout = await runCmd(ActivityUpdateCommand, [
      '9',
      '--subject',
      'Flag wins',
      '--body',
      '{"subject":"Body subject","priority":5}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(9)
  })

  it('rejects an update with no changes (exit 64)', async () => {
    await expect(ActivityUpdateCommand.run(['9'])).rejects.toThrow(
      /nothing to update/i,
    )
  })
})

describe('activity update --person', () => {
  it('maps --person to a primary participant (person_id is read-only)', async () => {
    mockApi()
      .patch('/api/v2/activities/9', {
        participants: [{ person_id: 7, primary: true }],
      })
      .reply(200, { success: true, data: { id: 9, person_id: 7 } })

    const stdout = await runCmd(ActivityUpdateCommand, [
      '9',
      '--person',
      '7',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).person_id).toBe(7)
  })
})
