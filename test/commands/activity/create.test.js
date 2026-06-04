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

const { default: ActivityCreateCommand } =
  await import('../../../src/commands/activity/create.js')
const { clearFieldsCache } = await import('../../../src/lib/fields.js')
import { runCmd, mockApi } from '../../helpers.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

describe('activity create', () => {
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

  it('POSTs typed flags as a v2 body and prints the created activity', async () => {
    // person_id is read-only on v2 activities (verified live) — --person
    // must map to participants: [{ person_id, primary: true }].
    mockApi()
      .post('/api/v2/activities', {
        subject: 'Demo call',
        type: 'call',
        due_date: '2026-06-10',
        due_time: '14:30',
        duration: '00:30',
        deal_id: 42,
        participants: [{ person_id: 7, primary: true }],
        org_id: 3,
        owner_id: 5,
        note: 'Bring slides',
      })
      .reply(201, {
        success: true,
        data: { id: 99, subject: 'Demo call', type: 'call' },
      })

    const stdout = await runCmd(ActivityCreateCommand, [
      '--subject',
      'Demo call',
      '--type',
      'call',
      '--due-date',
      '2026-06-10',
      '--due-time',
      '14:30',
      '--duration',
      '00:30',
      '--deal',
      '42',
      '--person',
      '7',
      '--org',
      '3',
      '--owner',
      '5',
      '--note',
      'Bring slides',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(99)
  })

  it('defaults --type to task', async () => {
    mockApi()
      .post('/api/v2/activities', {
        subject: 'Follow up',
        type: 'task',
      })
      .reply(201, {
        success: true,
        data: { id: 100, subject: 'Follow up', type: 'task' },
      })

    const stdout = await runCmd(ActivityCreateCommand, [
      '--subject',
      'Follow up',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).type).toBe('task')
  })

  it('includes done:true only when --done is set', async () => {
    mockApi()
      .post('/api/v2/activities', {
        subject: 'Done task',
        type: 'task',
        done: true,
      })
      .reply(201, {
        success: true,
        data: { id: 101, subject: 'Done task' },
      })

    const stdout = await runCmd(ActivityCreateCommand, [
      '--subject',
      'Done task',
      '--done',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(101)
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
            options: [
              { id: 10, label: 'Positive' },
              { id: 11, label: 'Negative' },
            ],
          },
        ],
      })
    mockApi()
      .post('/api/v2/activities', {
        subject: 'Sized activity',
        type: 'task',
        custom_fields: { [HASH]: 10 },
      })
      .reply(201, {
        success: true,
        data: { id: 102, subject: 'Sized activity' },
      })

    const stdout = await runCmd(ActivityCreateCommand, [
      '--subject',
      'Sized activity',
      '--field',
      'Outcome=Positive',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(102)
  })

  it('merges --body JSON with typed flags winning', async () => {
    mockApi()
      .post('/api/v2/activities', {
        subject: 'Flag wins',
        type: 'task',
        location: 'HQ',
      })
      .reply(201, { success: true, data: { id: 103 } })

    const stdout = await runCmd(ActivityCreateCommand, [
      '--subject',
      'Flag wins',
      '--body',
      '{"subject":"Body subject","location":"HQ"}',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).id).toBe(103)
  })

  it('requires --subject', async () => {
    await expect(ActivityCreateCommand.run([])).rejects.toThrow()
  })
})
