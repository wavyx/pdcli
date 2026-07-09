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

const {
  default: MailListCommand,
  unwrapMailMessage,
  mailDirection,
} = await import('../../../src/commands/mail/list.js')
import { runCmd, mockApi } from '../../helpers.js'

// The deal mailMessages list wraps each message under { object, timestamp, data }.
const WRAPPED = [
  {
    object: 'mailMessage',
    timestamp: '2026-06-01 10:00:00',
    data: {
      id: 1,
      subject: 'Re: proposal',
      snippet: 'Thanks for sending this over',
      message_time: '2026-06-01T10:00:00Z',
      sent_flag: 0,
      has_body_flag: 1,
      body_url: 'https://example.cloudfront.net/1',
      from: [
        { email_address: 'jane@acme.com', name: 'Jane', linked_person_id: 10 },
      ],
      to: [
        { email_address: 'rep@us.com', name: 'Rep', linked_person_id: null },
      ],
    },
  },
]

describe('mail list', () => {
  beforeEach(() => {
    nock.cleanAll()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })
  afterEach(() => nock.cleanAll())

  it('lists a deal mail messages, unwrapped, as JSON', async () => {
    mockApi()
      .get('/api/v1/deals/42/mailMessages')
      .query(true)
      .reply(200, {
        success: true,
        data: WRAPPED,
        additional_data: { pagination: { more_items_in_collection: false } },
      })

    const stdout = await runCmd(MailListCommand, [
      '--deal',
      '42',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows).toHaveLength(1)
    // Unwrapped: the message fields sit at the top level, not under .data.
    expect(rows[0].id).toBe(1)
    expect(rows[0].subject).toBe('Re: proposal')
    expect(rows[0].snippet).toBe('Thanks for sending this over')
    expect(rows[0].from[0].email_address).toBe('jane@acme.com')
  })

  it('renders a table with the derived direction and addresses', async () => {
    mockApi()
      .get('/api/v1/deals/42/mailMessages')
      .query(true)
      .reply(200, {
        success: true,
        data: WRAPPED,
        additional_data: { pagination: { more_items_in_collection: false } },
      })

    const stdout = await runCmd(MailListCommand, [
      '--deal',
      '42',
      '--output',
      'table',
    ])
    expect(stdout).toContain('received')
    expect(stdout).toContain('jane@acme.com')
    expect(stdout).toContain('Re: proposal')
  })

  it('renders sparse rows: name-only, addressless, and empty recipient lists', async () => {
    mockApi()
      .get('/api/v1/deals/42/mailMessages')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            object: 'mailMessage',
            data: {
              id: 10,
              message_time: '2026-06-03T10:00:00Z',
              sent_flag: 1,
              // no subject, no snippet
              from: [{ name: 'No Address' }], // name fallback for From
              to: [], // empty → blank To
            },
          },
          {
            object: 'mailMessage',
            data: {
              id: 11,
              message_time: '2026-06-03T11:00:00Z',
              from: [{}], // neither email nor name → blank From
              to: [{ email_address: 'a@b.com' }],
            },
          },
        ],
        additional_data: { pagination: { more_items_in_collection: false } },
      })

    const stdout = await runCmd(MailListCommand, [
      '--deal',
      '42',
      '--output',
      'table',
    ])
    expect(stdout).toContain('No Address')
    expect(stdout).toContain('a@b.com')
    expect(stdout).toContain('sent')
  })

  it('surfaces a permission error (403) rather than swallowing it', async () => {
    mockApi()
      .get('/api/v1/deals/42/mailMessages')
      .query(true)
      .reply(403, { success: false, error: 'Scope mail:read is missing' })

    // A 403 is a real failure for an explicit `mail list` — the permission
    // error surfaces (exit 77 = EX_NOPERM), it is not degraded to an empty list.
    await expect(
      runCmd(MailListCommand, ['--deal', '42', '--output', 'json']),
    ).rejects.toMatchObject({ oclif: { exit: 77 } })
  })

  it('offset-pages when more_items is set (endpoint has no next_start)', async () => {
    const msg = (id) => ({ object: 'mailMessage', data: { id } })
    mockApi()
      .get('/api/v1/deals/42/mailMessages')
      .query((q) => q.start === '0')
      .reply(200, {
        success: true,
        data: [msg(1), msg(2)],
        additional_data: { pagination: { more_items_in_collection: true } },
      })
    mockApi()
      .get('/api/v1/deals/42/mailMessages')
      .query((q) => q.start === '2')
      .reply(200, {
        success: true,
        data: [msg(3)],
        additional_data: { pagination: { more_items_in_collection: false } },
      })

    const stdout = await runCmd(MailListCommand, [
      '--deal',
      '42',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout).map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('stops when a page carries no data (deal with no synced mail)', async () => {
    // No `data` key at all — exercises the `body.data ?? []` fallback too.
    mockApi()
      .get('/api/v1/deals/42/mailMessages')
      .query(true)
      .reply(200, {
        success: true,
        additional_data: { pagination: { more_items_in_collection: true } },
      })

    const stdout = await runCmd(MailListCommand, [
      '--deal',
      '42',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual([])
  })

  describe('unwrapMailMessage', () => {
    it('unwraps the { object, timestamp, data } list shape', () => {
      expect(
        unwrapMailMessage({ object: 'mailMessage', data: { id: 7 } }),
      ).toEqual({ id: 7 })
    })
    it('returns an already-flat message unchanged', () => {
      expect(unwrapMailMessage({ id: 7, subject: 'x' })).toEqual({
        id: 7,
        subject: 'x',
      })
    })
  })

  describe('mailDirection', () => {
    it('maps sent_flag 1 to sent and 0 to received', () => {
      expect(mailDirection({ sent_flag: 1 })).toBe('sent')
      expect(mailDirection({ sent_flag: 0 })).toBe('received')
      expect(mailDirection({})).toBe('received')
    })
  })
})
