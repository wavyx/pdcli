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

const { default: DealContextCommand, summarizeMail } =
  await import('../../../src/commands/deal/context.js')
import { runCmd, mockApi } from '../../helpers.js'
import { clearFieldsCache } from '../../../src/lib/fields.js'

const DAY = 86_400_000
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString()
const dateAhead = (n) =>
  new Date(Date.now() + n * DAY).toISOString().slice(0, 10)

const DEAL = {
  id: 42,
  title: 'Acme expansion',
  status: 'open',
  value: 100000,
  currency: 'USD',
  person_id: 10,
  org_id: 20,
  update_time: daysAgo(1), // fresh
  expected_close_date: dateAhead(20), // future
  custom_fields: { hash1: 5 },
}

function mockFields() {
  mockApi()
    .get('/api/v2/dealFields')
    .query(true)
    .reply(200, {
      success: true,
      data: [
        {
          field_code: 'hash1',
          field_name: 'Region',
          options: [{ id: 5, label: 'EMEA' }],
        },
      ],
    })
  for (const f of ['personFields', 'organizationFields', 'activityFields']) {
    mockApi()
      .get(`/api/v2/${f}`)
      .query(true)
      .reply(200, { success: true, data: [] })
  }
  mockApi()
    .get('/api/v1/noteFields')
    .query(true)
    .reply(200, { success: true, data: [] })
}

// The deal mailMessages list wraps each message under { object, timestamp, data }.
const MAIL_WRAPPED = [
  {
    object: 'mailMessage',
    timestamp: '2026-06-01 10:00:00',
    data: {
      id: 1,
      subject: 'Re: proposal',
      snippet: 'Thanks for sending this over',
      message_time: '2026-06-01T10:00:00Z',
      sent_flag: 0,
      from: [
        { email_address: 'jane@acme.com', name: 'Jane', linked_person_id: 10 },
      ],
      to: [
        { email_address: 'rep@us.com', name: 'Rep', linked_person_id: null },
      ],
    },
  },
  {
    object: 'mailMessage',
    timestamp: '2026-06-02 09:00:00',
    data: {
      id: 2,
      subject: 'Following up',
      snippet: 'Just checking in',
      message_time: '2026-06-02T09:00:00Z',
      sent_flag: 1,
      from: [
        { email_address: 'rep@us.com', name: 'Rep', linked_person_id: null },
      ],
      to: [
        { email_address: 'jane@acme.com', name: 'Jane', linked_person_id: 10 },
      ],
    },
  },
]

function mockMail(status, body) {
  return mockApi()
    .get('/api/v1/deals/42/mailMessages')
    .query(true)
    .reply(status, body)
}

function mockCoreBundle() {
  mockApi().get('/api/v2/deals/42').reply(200, { success: true, data: DEAL })
  mockApi()
    .get('/api/v2/persons/10')
    .reply(200, { success: true, data: { id: 10, name: 'Jane Doe' } })
  mockApi()
    .get('/api/v2/organizations/20')
    .reply(200, { success: true, data: { id: 20, name: 'Acme Inc' } })
  mockApi()
    .get('/api/v2/activities')
    .query((q) => q.deal_id === '42')
    .reply(200, {
      success: true,
      data: [{ id: 1, subject: 'Call', done: false }],
    })
  mockApi()
    .get('/api/v1/notes')
    .query((q) => q.deal_id === '42')
    .reply(200, { success: true, data: [{ id: 1, content: 'note' }] })
  mockApi()
    .get('/api/v2/deals/42/products')
    .query(true)
    .reply(200, { success: true, data: [{ id: 1, product_id: 5 }] })
  mockApi()
    .get('/api/v1/deals/42/participants')
    .query(true)
    .reply(200, { success: true, data: [] })
  mockFields()
}

function mockFullBundle() {
  mockCoreBundle()
  mockMail(200, {
    success: true,
    data: MAIL_WRAPPED,
    additional_data: { pagination: { more_items_in_collection: false } },
  })
}

describe('deal context', () => {
  beforeEach(() => {
    nock.cleanAll()
    clearFieldsCache()
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
  })
  afterEach(() => nock.cleanAll())

  it('assembles the full bundle with hydrated contacts and resolved fields (JSON)', async () => {
    mockFullBundle()
    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'json'])
    const b = JSON.parse(stdout)
    expect(b.deal.id).toBe(42)
    // custom field hash resolved to name + option label
    expect(b.deal.custom_fields).toEqual({ Region: 'EMEA' })
    expect(b.person.name).toBe('Jane Doe')
    expect(b.org.name).toBe('Acme Inc')
    expect(b.activities).toHaveLength(1)
    expect(b.notes).toHaveLength(1)
    expect(b.products).toHaveLength(1)
    expect(b.flags).toMatchObject({
      missingContact: false,
      staleOpen: false,
      pastClose: false,
      noCloseDate: false,
      noOpenActivities: false,
      activityCount: 1,
      noteCount: 1,
      productCount: 1,
    })
    // Mail summary: latest message (by message_time) drives the signal.
    expect(b.mail).toMatchObject({
      message_count: 2,
      last_message_at: '2026-06-02T09:00:00Z',
      last_direction: 'sent',
      latest_subject: 'Following up',
    })
    expect(b.mail.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'jane@acme.com',
          linked_person_id: 10,
        }),
      ]),
    )
  })

  it('renders a compact summary in table mode', async () => {
    mockFullBundle()
    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'table'])
    expect(stdout).toContain('Acme expansion')
    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('Acme Inc')
    expect(stdout).toMatch(/Mail: 2 msgs .* sent/)
  })

  it('renders the mail line without a timestamp when message_time is absent', async () => {
    mockCoreBundle()
    mockMail(200, {
      success: true,
      data: [
        {
          object: 'mailMessage',
          data: { id: 9, from: [{ email_address: 'z@z.com' }] }, // no message_time
        },
      ],
      additional_data: { pagination: { more_items_in_collection: false } },
    })
    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'table'])
    expect(stdout).toMatch(/Mail: 1 msgs · last received$/m)
  })

  it('sets mail to null and skips the fetch with --no-mail', async () => {
    mockCoreBundle()
    // Register the mail interceptor but expect it to stay unused.
    const mail = mockMail(200, { success: true, data: MAIL_WRAPPED })
    const stdout = await runCmd(DealContextCommand, [
      '42',
      '--no-mail',
      '--output',
      'json',
    ])
    const b = JSON.parse(stdout)
    expect(b.mail).toBeNull()
    expect(mail.isDone()).toBe(false)
  })

  it('degrades mail to null on a 403 (no mail:read scope) without failing', async () => {
    mockCoreBundle()
    mockMail(403, { success: false, error: 'Scope mail:read is missing' })
    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'json'])
    const b = JSON.parse(stdout)
    expect(b.deal.id).toBe(42)
    expect(b.mail).toBeNull()
  })

  it('sets mail to null when the deal has no synced mail', async () => {
    mockCoreBundle()
    mockMail(200, {
      success: true,
      data: [],
      additional_data: { pagination: { more_items_in_collection: false } },
    })
    const stdout = await runCmd(DealContextCommand, ['42', '--output', 'json'])
    const b = JSON.parse(stdout)
    expect(b.mail).toBeNull()
  })

  it('skips slices with --no-* flags (no fetch, empty in the bundle)', async () => {
    mockApi().get('/api/v2/deals/42').reply(200, { success: true, data: DEAL })
    mockApi()
      .get('/api/v2/persons/10')
      .reply(200, { success: true, data: { id: 10, name: 'Jane Doe' } })
    mockApi()
      .get('/api/v2/organizations/20')
      .reply(200, { success: true, data: { id: 20, name: 'Acme Inc' } })
    // dealFields/personFields/organizationFields still fetched for resolution
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, {
        success: true,
        data: [
          {
            field_code: 'hash1',
            field_name: 'Region',
            options: [{ id: 5, label: 'EMEA' }],
          },
        ],
      })
    for (const f of ['personFields', 'organizationFields']) {
      mockApi()
        .get(`/api/v2/${f}`)
        .query(true)
        .reply(200, { success: true, data: [] })
    }
    // No activities/notes/products/participants interceptors: if the command
    // tried to fetch them, nock would throw.
    const stdout = await runCmd(DealContextCommand, [
      '42',
      '--no-activities',
      '--no-notes',
      '--no-products',
      '--no-participants',
      '--no-mail',
      '--output',
      'json',
    ])
    const b = JSON.parse(stdout)
    expect(b.activities).toEqual([])
    expect(b.notes).toEqual([])
    expect(b.flags.activityCount).toBe(0)
    // activities were not fetched → the flag must be null, not a false "no open"
    expect(b.flags.noOpenActivities).toBeNull()
  })

  it('renders a sparse deal (no value/contact) and lists risk flags in the table', async () => {
    mockApi()
      .get('/api/v2/deals/42')
      .reply(200, {
        success: true,
        // No title and no status either — exercises those table fallbacks.
        data: {
          id: 42,
          value: null,
          currency: null,
          person_id: null,
          org_id: null,
          update_time: '2026-01-01T00:00:00Z',
          expected_close_date: null,
          custom_fields: {},
        },
      })
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/activities')
      .query((q) => q.deal_id === '42')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v1/notes')
      .query((q) => q.deal_id === '42')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals/42/products')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query(true)
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(DealContextCommand, [
      '42',
      '--no-mail',
      '--output',
      'table',
    ])
    expect(stdout).toContain('Deal 42')
    expect(stdout).toContain('Person: — · Org: —')
    expect(stdout).toMatch(/Flags:.*missingContact/)
  })

  it('handles a deal with no person or org (missingContact flag)', async () => {
    mockApi()
      .get('/api/v2/deals/42')
      .reply(200, {
        success: true,
        data: { ...DEAL, person_id: null, org_id: null, custom_fields: {} },
      })
    mockApi()
      .get('/api/v2/dealFields')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/activities')
      .query((q) => q.deal_id === '42')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v1/notes')
      .query((q) => q.deal_id === '42')
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v2/deals/42/products')
      .query(true)
      .reply(200, { success: true, data: [] })
    mockApi()
      .get('/api/v1/deals/42/participants')
      .query(true)
      .reply(200, { success: true, data: [] })

    const stdout = await runCmd(DealContextCommand, [
      '42',
      '--no-mail',
      '--output',
      'json',
    ])
    const b = JSON.parse(stdout)
    expect(b.person).toBeNull()
    expect(b.org).toBeNull()
    expect(b.flags.missingContact).toBe(true)
    expect(b.mail).toBeNull()
  })

  describe('summarizeMail', () => {
    it('returns null for a non-array or empty input', () => {
      expect(summarizeMail(null)).toBeNull()
      expect(summarizeMail([])).toBeNull()
    })

    it('dedupes participants, skips keyless parties, keeps the latest by time', () => {
      const summary = summarizeMail([
        {
          id: 1,
          message_time: '2026-06-02T00:00:00Z',
          subject: 'B',
          sent_flag: 1,
          from: [{ email_address: 'a@b.com', name: 'A', linked_person_id: 1 }],
          to: [{ name: 'NameOnly' }, { linked_person_id: 5 }, {}],
        },
        // No message_time / subject / to → older; from repeats a@b.com (deduped).
        { id: 2, from: [{ email_address: 'a@b.com' }] },
      ])
      expect(summary.message_count).toBe(2)
      expect(summary.last_message_at).toBe('2026-06-02T00:00:00Z')
      expect(summary.latest_subject).toBe('B')
      expect(summary.last_direction).toBe('sent')
      expect(summary.participants).toEqual([
        { name: 'A', email: 'a@b.com', linked_person_id: 1 },
        { name: 'NameOnly', email: null, linked_person_id: null },
        { name: null, email: null, linked_person_id: 5 },
      ])
    })

    it('promotes a later message and handles a missing from array', () => {
      const summary = summarizeMail([
        { id: 3, to: [{ email_address: 'x@y.com' }] }, // no from / time / subject
        { id: 4, message_time: '2026-01-01T00:00:00Z', from: [] },
      ])
      // id4 has a time, id3 does not → id4 is latest, but it has no subject.
      expect(summary.last_message_at).toBe('2026-01-01T00:00:00Z')
      expect(summary.latest_subject).toBeNull()
      expect(summary.participants).toEqual([
        { name: null, email: 'x@y.com', linked_person_id: null },
      ])
    })

    it('reports null time/subject when the sole message lacks them', () => {
      const summary = summarizeMail([
        { id: 5, from: [{ email_address: 'z@z.com' }] },
      ])
      expect(summary.last_message_at).toBeNull()
      expect(summary.latest_subject).toBeNull()
      expect(summary.last_direction).toBe('received')
    })
  })
})
