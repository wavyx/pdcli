import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { EventEmitter } from 'node:events'
import { request as httpRequest } from 'node:http'

const mockResolveCredentials = vi.fn()
vi.mock('../../../src/lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveCredentials: mockResolveCredentials }
})

// Stateful config mock: profile keys live in a plain object so the command's
// watermark + orphan-id bookkeeping is observable from the test.
let store
vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
  getProfileConfig: vi.fn((_p, key) => store[key]),
  setProfileConfig: vi.fn((_p, key, value) => {
    store[key] = value
  }),
  deleteProfileConfig: vi.fn((_p, key) => {
    delete store[key]
  }),
}))

const listenModule = await import('../../../src/commands/webhook/listen.js')
const {
  default: WebhookListenCommand,
  testHooks,
  matchesEvents,
  eventKey,
  toSyntheticEvent,
  formatDeliveryLine,
  compareByUpdateTime,
} = listenModule
import { runCmd, mockApi } from '../../helpers.js'
import { formatApiDatetime } from '../../../src/lib/period.js'

const DAY = 86_400_000
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString()

/** Build a Basic auth header value from the receiver's generated creds. */
function basicAuth(creds) {
  return (
    'Basic ' + Buffer.from(`${creds.user}:${creds.password}`).toString('base64')
  )
}

/** POST a JSON body to the local receiver and resolve its HTTP status. */
async function deliver(port, payload, { raw, creds } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (creds) headers.authorization = basicAuth(creds)
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(payload),
  })
  return res.status
}

/** POST via raw node http (no content-type header) to exercise the default. */
function deliverNoContentType(port, payload, creds) {
  return new Promise((resolve, reject) => {
    const headers = {}
    if (creds) headers.Authorization = basicAuth(creds)
    const req = httpRequest(
      { host: '127.0.0.1', port, method: 'POST', path: '/', headers },
      (res) => {
        res.resume()
        res.on('end', resolve)
      },
    )
    req.on('error', reject)
    req.end(JSON.stringify(payload))
  })
}

describe('webhook listen', () => {
  beforeEach(() => {
    nock.cleanAll()
    store = {}
    testHooks.signals = undefined
    testHooks.onListening = undefined
    testHooks.sleep = undefined
    mockResolveCredentials.mockResolvedValue({
      mode: 'token',
      companyDomain: 'acme',
      token: 'tok',
      source: 'profile',
    })
    // Real loopback receiver is allowed; the Pipedrive API host is nocked.
    nock.disableNetConnect()
    nock.enableNetConnect('127.0.0.1')
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
    testHooks.signals = undefined
    testHooks.onListening = undefined
    testHooks.sleep = undefined
  })

  // ---- pure helpers -------------------------------------------------------

  describe('matchesEvents', () => {
    it('matches everything when no patterns are given', () => {
      expect(matchesEvents('deal.change', [])).toBe(true)
      expect(matchesEvents('deal.change', undefined)).toBe(true)
    })
    it('matches an exact entity.action pattern', () => {
      expect(matchesEvents('deal.change', ['deal.change'])).toBe(true)
      expect(matchesEvents('person.change', ['deal.change'])).toBe(false)
    })
    it('supports wildcards on either side', () => {
      expect(matchesEvents('person.create', ['person.*'])).toBe(true)
      expect(matchesEvents('deal.delete', ['*.delete'])).toBe(true)
      expect(matchesEvents('deal.delete', ['person'])).toBe(false)
    })
    it('treats a bare entity pattern as entity.*', () => {
      expect(matchesEvents('deal.change', ['deal'])).toBe(true)
    })
  })

  describe('eventKey', () => {
    it('reads meta.entity + meta.action', () => {
      expect(eventKey({ meta: { entity: 'deal', action: 'change' } })).toBe(
        'deal.change',
      )
    })
    it('falls back to unknown parts', () => {
      expect(eventKey({})).toBe('unknown.unknown')
      expect(eventKey(null)).toBe('unknown.unknown')
    })
  })

  describe('toSyntheticEvent', () => {
    it('shapes a record like a webhook delivery envelope', () => {
      const rec = {
        id: 1,
        title: 'X',
        add_time: daysAgo(2),
        update_time: daysAgo(1),
      }
      const evt = toSyntheticEvent('deals', rec, daysAgo(30))
      expect(evt.event).toBe('deal.create')
      expect(evt.meta).toMatchObject({
        action: 'create',
        entity: 'deal',
        id: 1,
      })
      expect(evt.current).toBe(rec)
      expect(evt.previous).toBeNull()
    })
    it('maps an older record to a change action', () => {
      const rec = { id: 2, update_time: daysAgo(1), add_time: daysAgo(100) }
      const evt = toSyntheticEvent('persons', rec, daysAgo(30))
      expect(evt.event).toBe('person.change')
    })
  })

  describe('compareByUpdateTime', () => {
    const ev = (t) => ({ meta: { updateTime: t } })
    it('orders timestamps ascending', () => {
      expect(
        compareByUpdateTime(
          ev('2026-01-01T00:00:00Z'),
          ev('2026-02-01T00:00:00Z'),
        ),
      ).toBeLessThan(0)
    })
    it('sorts a missing timestamp after a present one', () => {
      expect(compareByUpdateTime(ev(null), ev('2026-01-01T00:00:00Z'))).toBe(1)
      expect(compareByUpdateTime(ev('2026-01-01T00:00:00Z'), ev(null))).toBe(-1)
    })
    it('treats two missing timestamps as equal', () => {
      expect(compareByUpdateTime(ev(null), ev(null))).toBe(0)
    })
  })

  describe('formatDeliveryLine', () => {
    it('includes the event key and id', () => {
      const line = formatDeliveryLine({
        meta: { entity: 'deal', action: 'change', id: 7 },
      })
      expect(line).toContain('deal.change')
      expect(line).toContain('#7')
    })
    it('omits the id fragment when none is present', () => {
      const line = formatDeliveryLine({
        meta: { entity: 'deal', action: 'change' },
      })
      expect(line).toContain('deal.change')
      expect(line).not.toContain('#')
    })
    it('falls back to current.id when meta has no id', () => {
      const line = formatDeliveryLine({
        meta: { entity: 'deal', action: 'change' },
        current: { id: 21 },
      })
      expect(line).toContain('#21')
    })
  })

  // ---- flag validation ----------------------------------------------------

  it('errors (64) without --url and without --synthetic', async () => {
    const err = await WebhookListenCommand.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  // ---- tunnel mode --------------------------------------------------------

  it('creates a temp webhook, prints a delivery, and deletes on shutdown (--once)', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post(
        '/api/v1/webhooks',
        (b) => b.name.startsWith('pdcli-listen:') && b.event_action === '*',
      )
      .reply(201, { success: true, data: { id: 42 } })
    const del = mockApi()
      .delete('/api/v1/webhooks/42')
      .reply(200, { success: true, data: { id: 42 } })

    testHooks.onListening = async (port, creds) => {
      await deliver(
        port,
        { meta: { entity: 'deal', action: 'change', id: 9 } },
        { creds },
      )
    }

    const stdout = await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
      '--once',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout.trim())).toMatchObject({
      meta: { entity: 'deal', action: 'change', id: 9 },
    })
    expect(del.isDone()).toBe(true)
    // The orphan-GC id is cleared after a clean shutdown.
    expect(store.listen_webhook_id).toBeUndefined()
  })

  it('renders a human line in a TTY (table) and forwards the raw payload', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 1 } })
    mockApi()
      .delete('/api/v1/webhooks/1')
      .reply(200, { success: true, data: {} })

    // Real sink server captures what the command forwards.
    const { createServer } = await import('node:http')
    const received = []
    const sink = createServer((req, res) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        received.push(Buffer.concat(chunks).toString('utf8'))
        res.writeHead(200)
        res.end()
      })
    })
    await new Promise((r) => sink.listen(0, '127.0.0.1', r))
    const sinkUrl = `http://127.0.0.1:${sink.address().port}/`

    testHooks.onListening = async (port, creds) => {
      await deliver(
        port,
        {
          meta: { entity: 'person', action: 'create', id: 3 },
        },
        { creds },
      )
    }

    const stdout = await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--forward-to',
      sinkUrl,
      '--port',
      '0',
      '--once',
    ])
    await new Promise((r) => sink.close(r))
    expect(stdout).toContain('person.create')
    expect(received).toHaveLength(1)
    expect(JSON.parse(received[0])).toMatchObject({ meta: { id: 3 } })
  })

  it('filters deliveries by --events (non-matching are dropped, not counted)', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 5 } })
    mockApi()
      .delete('/api/v1/webhooks/5')
      .reply(200, { success: true, data: {} })

    testHooks.onListening = async (port, creds) => {
      // A non-matching event first (dropped), then a matching one triggers --once.
      await deliver(
        port,
        {
          meta: { entity: 'person', action: 'change', id: 1 },
        },
        { creds },
      )
      await deliver(
        port,
        { meta: { entity: 'deal', action: 'change', id: 2 } },
        { creds },
      )
    }

    const stdout = await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--events',
      'deal.*',
      '--port',
      '0',
      '--once',
      '--output',
      'json',
    ])
    const lines = stdout.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).meta.id).toBe(2)
  })

  it('stops after --max-events deliveries', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 8 } })
    mockApi()
      .delete('/api/v1/webhooks/8')
      .reply(200, { success: true, data: {} })

    testHooks.onListening = async (port, creds) => {
      await deliver(
        port,
        { meta: { entity: 'deal', action: 'change', id: 1 } },
        { creds },
      )
      await deliver(
        port,
        { meta: { entity: 'deal', action: 'change', id: 2 } },
        { creds },
      )
    }

    const stdout = await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--max-events',
      '2',
      '--port',
      '0',
      '--output',
      'json',
    ])
    expect(stdout.trim().split('\n').filter(Boolean)).toHaveLength(2)
  })

  it('answers 405 to non-POST probes and tolerates non-JSON bodies', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 3 } })
    mockApi()
      .delete('/api/v1/webhooks/3')
      .reply(200, { success: true, data: {} })

    let probeStatus
    testHooks.onListening = async (port, creds) => {
      probeStatus = (await fetch(`http://127.0.0.1:${port}/`)).status
      await deliver(port, null, { raw: 'not json', creds })
    }

    const stdout = await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
      '--once',
      '--output',
      'json',
    ])
    expect(probeStatus).toBe(405)
    expect(JSON.parse(stdout.trim())).toEqual({ raw: 'not json' })
  })

  it('sweeps only stale leftovers and never a concurrently-live listener', async () => {
    // A concurrent session's own id is tracked in the shared config set.
    store.listen_webhook_id = [999]
    const stale = '2020-01-01 00:00:00' // long ago → crash leftover
    const fresh = new Date().toISOString() // just created → live listener
    mockApi()
      .get('/api/v1/webhooks')
      .reply(200, {
        success: true,
        data: [
          { id: 100, name: 'pdcli-listen:crashed', add_time: stale }, // swept
          { id: 150, name: 'pdcli-listen:notime' }, // no add_time → swept
          { id: 200, name: 'pdcli-listen:live', add_time: fresh }, // fresh → kept
          { id: 999, name: 'pdcli-listen:mine', add_time: stale }, // tracked → kept
          { id: 300, name: 'someone-elses-hook', add_time: stale }, // no prefix → kept
          { id: 500, add_time: stale }, // no name → kept
        ],
      })
    const del100 = mockApi()
      .delete('/api/v1/webhooks/100')
      .reply(200, { success: true })
    const del150 = mockApi()
      .delete('/api/v1/webhooks/150')
      .reply(200, { success: true })
    mockApi()
      .post(
        '/api/v1/webhooks',
        (b) =>
          b.name.startsWith('pdcli-listen:') &&
          typeof b.http_auth_user === 'string' &&
          typeof b.http_auth_password === 'string',
      )
      .reply(201, { success: true, data: { id: 90 } })
    mockApi()
      .delete('/api/v1/webhooks/90')
      .reply(200, { success: true, data: {} })

    const signals = new EventEmitter()
    testHooks.signals = signals
    testHooks.onListening = () => signals.emit('SIGINT')

    await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
    ])
    // Only the stale leftovers were swept; live + tracked + foreign left alone.
    expect(del100.isDone()).toBe(true)
    expect(del150.isDone()).toBe(true)
    // The concurrent listener's tracking id survives this run's shutdown.
    expect(store.listen_webhook_id).toEqual([999])
  })

  it('tolerates a failed orphan-list sweep (best effort)', async () => {
    mockApi().get('/api/v1/webhooks').reply(500, { success: false })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 11 } })
    mockApi()
      .delete('/api/v1/webhooks/11')
      .reply(200, { success: true, data: {} })

    const signals = new EventEmitter()
    testHooks.signals = signals
    testHooks.onListening = () => signals.emit('SIGTERM')

    await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
      '--no-retry',
    ])
    // No throw; the run cleaned up its own webhook via the SIGTERM path.
    expect(store.listen_webhook_id).toBeUndefined()
  })

  it('swallows a forward-to failure and defaults a missing content-type', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 12 } })
    mockApi()
      .delete('/api/v1/webhooks/12')
      .reply(200, { success: true, data: {} })

    // A forward-to that is guaranteed to refuse the connection.
    const { createServer } = await import('node:http')
    const dead = createServer(() => {})
    await new Promise((r) => dead.listen(0, '127.0.0.1', r))
    const deadUrl = `http://127.0.0.1:${dead.address().port}/`
    await new Promise((r) => dead.close(r))

    testHooks.onListening = async (port, creds) => {
      // No content-type header on this delivery → forwardEvent defaults it.
      await deliverNoContentType(
        port,
        {
          meta: { entity: 'deal', action: 'change', id: 1 },
        },
        creds,
      )
    }

    await expect(
      runCmd(WebhookListenCommand, [
        '--url',
        'https://tunnel.example',
        '--forward-to',
        deadUrl,
        '--port',
        '0',
        '--once',
        '--output',
        'json',
      ]),
    ).resolves.toBeDefined()
  })

  it('continues when sweeping an orphaned webhook fails to delete', async () => {
    mockApi()
      .get('/api/v1/webhooks')
      .reply(200, {
        success: true,
        data: [
          {
            id: 70,
            name: 'pdcli-listen:crashed',
            add_time: '2020-01-01 00:00:00',
          },
        ],
      })
    mockApi().delete('/api/v1/webhooks/70').reply(500, { success: false })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 71 } })
    mockApi()
      .delete('/api/v1/webhooks/71')
      .reply(200, { success: true, data: {} })

    const signals = new EventEmitter()
    testHooks.signals = signals
    testHooks.onListening = () => signals.emit('SIGINT')

    await expect(
      runCmd(WebhookListenCommand, [
        '--url',
        'https://tunnel.example',
        '--port',
        '0',
        '--no-retry',
      ]),
    ).resolves.toBeDefined()
  })

  it('handles an empty (204) webhook list during the orphan sweep', async () => {
    mockApi().get('/api/v1/webhooks').reply(204)
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 33 } })
    mockApi()
      .delete('/api/v1/webhooks/33')
      .reply(200, { success: true, data: {} })

    const signals = new EventEmitter()
    testHooks.signals = signals
    testHooks.onListening = () => signals.emit('SIGINT')

    await expect(
      runCmd(WebhookListenCommand, [
        '--url',
        'https://tunnel.example',
        '--port',
        '0',
      ]),
    ).resolves.toBeDefined()
  })

  it('shuts down and deletes the webhook on SIGINT', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 55 } })
    const del = mockApi()
      .delete('/api/v1/webhooks/55')
      .reply(200, { success: true })

    const signals = new EventEmitter()
    testHooks.signals = signals
    testHooks.onListening = () => signals.emit('SIGINT')

    await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
    ])
    expect(del.isDone()).toBe(true)
  })

  it('a repeated signal is a no-op (idempotent shutdown)', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 66 } })
    const del = mockApi()
      .delete('/api/v1/webhooks/66')
      .reply(200, { success: true })

    const signals = new EventEmitter()
    testHooks.signals = signals
    testHooks.onListening = () => {
      signals.emit('SIGINT')
      signals.emit('SIGINT') // second one must not double-delete
    }

    await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
    ])
    expect(del.isDone()).toBe(true)
  })

  it('swallows a cleanup DELETE failure on shutdown', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 4 } })
    mockApi().delete('/api/v1/webhooks/4').reply(500, { success: false })

    const signals = new EventEmitter()
    testHooks.signals = signals
    testHooks.onListening = () => signals.emit('SIGINT')

    // Must resolve despite the DELETE failing.
    await expect(
      runCmd(WebhookListenCommand, [
        '--url',
        'https://tunnel.example',
        '--port',
        '0',
        '--no-retry',
      ]),
    ).resolves.toBeDefined()
  })

  it('rejects when the receiver port cannot be bound', async () => {
    const { createServer } = await import('node:http')
    const blocker = createServer(() => {})
    await new Promise((r) => blocker.listen(0, '127.0.0.1', r))
    const busyPort = blocker.address().port
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })

    const err = await WebhookListenCommand.run([
      '--url',
      'https://tunnel.example',
      '--port',
      String(busyPort),
    ]).catch((e) => e)
    await new Promise((r) => blocker.close(r))
    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
  })

  it('rejects (and closes the server) when the webhook cannot be created', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi().post('/api/v1/webhooks').reply(500, { success: false })

    const err = await WebhookListenCommand.run([
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
      '--no-retry',
    ]).catch((e) => e)
    expect(err).toBeDefined()
    expect(err.exitCode ?? err.oclif?.exit).not.toBe(0)
  })

  it('rejects a forged POST lacking the generated basic-auth creds', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post(
        '/api/v1/webhooks',
        (b) =>
          typeof b.http_auth_user === 'string' &&
          typeof b.http_auth_password === 'string',
      )
      .reply(201, { success: true, data: { id: 61 } })
    mockApi()
      .delete('/api/v1/webhooks/61')
      .reply(200, { success: true, data: {} })

    let noAuthStatus, wrongAuthStatus
    testHooks.onListening = async (port, creds) => {
      // No Authorization header at all → 401, never emitted or forwarded.
      noAuthStatus = await deliver(port, {
        meta: { entity: 'deal', action: 'change', id: 1 },
      })
      // Wrong credentials → 401.
      wrongAuthStatus = await deliver(
        port,
        { meta: { entity: 'deal', action: 'change', id: 2 } },
        { creds: { user: 'nope', password: 'wrong' } },
      )
      // Correct credentials → accepted, triggers --once.
      await deliver(
        port,
        { meta: { entity: 'deal', action: 'change', id: 3 } },
        { creds },
      )
    }

    const stdout = await runCmd(WebhookListenCommand, [
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
      '--once',
      '--output',
      'json',
    ])
    expect(noAuthStatus).toBe(401)
    expect(wrongAuthStatus).toBe(401)
    const lines = stdout.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).meta.id).toBe(3) // only the authenticated one
  })

  it('cleans up the webhook + listeners on a post-bind server error', async () => {
    mockApi().get('/api/v1/webhooks').reply(200, { success: true, data: [] })
    mockApi()
      .post('/api/v1/webhooks')
      .reply(201, { success: true, data: { id: 78 } })
    const del = mockApi()
      .delete('/api/v1/webhooks/78')
      .reply(200, { success: true, data: {} })

    const signals = new EventEmitter()
    testHooks.signals = signals
    // Simulate e.g. EMFILE surfacing on the server AFTER a successful bind.
    testHooks.onListening = (_port, _creds, server) => {
      server.emit('error', new Error('EMFILE: too many open files'))
    }

    const err = await WebhookListenCommand.run([
      '--url',
      'https://tunnel.example',
      '--port',
      '0',
      '--no-retry',
    ]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    // The already-created webhook was deleted, not orphaned.
    expect(del.isDone()).toBe(true)
    // Signal handlers were removed and the own config entry cleared.
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
    expect(store.listen_webhook_id).toBeUndefined()
  })

  // ---- synthetic mode -----------------------------------------------------

  function mockCycle(deals = [], others = {}) {
    const data = {
      deals,
      persons: others.persons ?? [],
      organizations: others.organizations ?? [],
      activities: others.activities ?? [],
      products: others.products ?? [],
    }
    for (const [name, items] of Object.entries(data)) {
      mockApi()
        .get(`/api/v2/${name}`)
        .query(() => true)
        .reply(200, { success: true, data: items })
    }
  }

  it('emits webhook-shaped events from the changes feed (--synthetic --once)', async () => {
    mockCycle([
      { id: 1, title: 'A', add_time: daysAgo(2), update_time: daysAgo(1) },
    ])
    const stdout = await runCmd(WebhookListenCommand, [
      '--synthetic',
      '--since',
      '30d',
      '--once',
      '--output',
      'json',
    ])
    const evt = JSON.parse(stdout.trim())
    expect(evt).toMatchObject({
      event: 'deal.create',
      meta: { entity: 'deal', action: 'create', id: 1 },
      previous: null,
    })
    expect(evt.current.id).toBe(1)
    expect(store.listen_watermark).toBeDefined()
  })

  it('forwards synthetic events when --forward-to is set', async () => {
    mockCycle([
      { id: 2, title: 'B', add_time: daysAgo(2), update_time: daysAgo(1) },
    ])
    const { createServer } = await import('node:http')
    const received = []
    const sink = createServer((req, res) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        received.push(Buffer.concat(chunks).toString('utf8'))
        res.writeHead(200)
        res.end()
      })
    })
    await new Promise((r) => sink.listen(0, '127.0.0.1', r))
    const sinkUrl = `http://127.0.0.1:${sink.address().port}/`

    await runCmd(WebhookListenCommand, [
      '--synthetic',
      '--since',
      '30d',
      '--once',
      '--forward-to',
      sinkUrl,
      '--output',
      'json',
    ])
    await new Promise((r) => sink.close(r))
    expect(received).toHaveLength(1)
    expect(JSON.parse(received[0]).current.id).toBe(2)
  })

  it('resumes from the stored watermark when --since is omitted', async () => {
    store.listen_watermark = daysAgo(5)
    let sentSince
    mockApi()
      .get('/api/v2/deals')
      .query((q) => {
        sentSince = q.updated_since
        return true
      })
      .reply(200, { success: true, data: [] })
    for (const name of ['persons', 'organizations', 'activities', 'products']) {
      mockApi()
        .get(`/api/v2/${name}`)
        .query(() => true)
        .reply(200, { success: true, data: [] })
    }
    await runCmd(WebhookListenCommand, [
      '--synthetic',
      '--once',
      '--output',
      'json',
    ])
    expect(sentSince).toBe(store.listen_watermark)
  })

  it('errors (64) in synthetic mode with no --since and no stored watermark', async () => {
    const err = await WebhookListenCommand.run(['--synthetic']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('loops across cycles, sleeping between them, until --max-events', async () => {
    // Cycle 1 emits two events, cycle 2 one more → 3 reaches --max-events 3.
    mockCycle([
      { id: 1, title: 'a', add_time: daysAgo(2), update_time: daysAgo(3) },
      { id: 2, title: 'b', add_time: daysAgo(2), update_time: daysAgo(2) },
    ])
    mockCycle([
      { id: 3, title: 'c', add_time: daysAgo(2), update_time: daysAgo(1) },
    ])
    // No injected sleep: exercise the real timer (interval 0 keeps it fast).
    const stdout = await runCmd(WebhookListenCommand, [
      '--synthetic',
      '--since',
      '30d',
      '--interval',
      '0',
      '--max-events',
      '3',
      '--output',
      'json',
    ])
    expect(stdout.trim().split('\n').filter(Boolean)).toHaveLength(3)
  })

  it('does not drop same-second events when --max-events lands mid-second', async () => {
    // ids 1 & 2 share one update_time second; id 3 is a later second. With
    // --max-events 1 the naive loop would stop after id 1, then advance the
    // watermark past the whole second — silently losing id 2. The cut-second
    // guard drains the rest of that second (id 2) before stopping, and stops
    // before the strictly-later id 3.
    const sameSecond = '2026-07-01 12:00:00'
    const laterSecond = '2026-07-01 12:00:05'
    mockCycle([
      {
        id: 1,
        title: 'a',
        add_time: '2026-06-01 00:00:00',
        update_time: sameSecond,
      },
      {
        id: 2,
        title: 'b',
        add_time: '2026-06-01 00:00:00',
        update_time: sameSecond,
      },
      {
        id: 3,
        title: 'c',
        add_time: '2026-06-01 00:00:00',
        update_time: laterSecond,
      },
    ])
    const stdout = await runCmd(WebhookListenCommand, [
      '--synthetic',
      '--since',
      '90d',
      '--max-events',
      '1',
      '--output',
      'json',
    ])
    const ids = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).meta.id)
    // Both same-second events are emitted; the later-second one is not.
    expect(ids).toEqual([1, 2])
    // Watermark advanced one second past the boundary (nothing replays/drops).
    const expectedWatermark = formatApiDatetime(
      new Date(new Date(sameSecond).getTime() + 1000),
    )
    expect(store.listen_watermark).toBe(expectedWatermark)
  })

  it('sorts synthetic events by update_time, missing timestamps last', async () => {
    mockCycle([
      { id: 1, title: 'a', add_time: daysAgo(2), update_time: daysAgo(1) },
      { id: 2, title: 'b', add_time: daysAgo(2), update_time: daysAgo(2) },
      { id: 3, title: 'c', add_time: daysAgo(2) }, // no update_time → last
      { id: 4, title: 'd', add_time: daysAgo(2) }, // no update_time → last
    ])
    const stdout = await runCmd(WebhookListenCommand, [
      '--synthetic',
      '--since',
      '30d',
      '--once',
      '--output',
      'json',
    ])
    const ids = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).meta.id)
    // Oldest-first among timestamped rows; the two null rows keep their order.
    expect(ids).toEqual([2, 1, 3, 4])
  })

  it('stops the synthetic loop on SIGINT during the sleep window', async () => {
    mockCycle() // one empty cycle
    const signals = new EventEmitter()
    testHooks.signals = signals
    // First sleep fires the signal; the loop then exits on the stopping flag.
    testHooks.sleep = vi.fn(() => {
      signals.emit('SIGINT')
      return Promise.resolve()
    })

    await expect(
      runCmd(WebhookListenCommand, [
        '--synthetic',
        '--since',
        '30d',
        '--output',
        'json',
      ]),
    ).resolves.toBeDefined()
  })

  it('drops synthetic events filtered out by --events but still advances', async () => {
    mockCycle(
      [{ id: 1, title: 'a', add_time: daysAgo(2), update_time: daysAgo(1) }],
      {
        persons: [
          { id: 7, name: 'p', add_time: daysAgo(2), update_time: daysAgo(1) },
        ],
      },
    )
    const stdout = await runCmd(WebhookListenCommand, [
      '--synthetic',
      '--since',
      '30d',
      '--once',
      '--events',
      'person.*',
      '--output',
      'json',
    ])
    const lines = stdout.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).meta.entity).toBe('person')
    // Watermark still advanced past the deal it dropped.
    expect(store.listen_watermark).toBeDefined()
  })
})
