import { createServer } from 'node:http'
import { Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'
import { resolveSince, formatApiDatetime } from '../../lib/period.js'
import { categorizeChange } from '../../lib/changes.js'
import { collectPages } from '../../lib/pagination.js'
import {
  getProfileConfig,
  setProfileConfig,
  deleteProfileConfig,
} from '../../lib/config.js'

/** Name stamped on every temp webhook so a later run can sweep leftovers. */
const MARKER = 'pdcli-listen'
/** Per-profile config key holding the last temp webhook id (orphan GC). */
const LISTEN_ID_KEY = 'listen_webhook_id'
/** Per-profile resume watermark for --synthetic (kept apart from `changes`). */
const WATERMARK_KEY = 'listen_watermark'
const DEFAULT_PORT = 3000
const DEFAULT_INTERVAL_MS = 10_000

/** v2 entities that support `updated_since` + update_time ordering. */
const ENTITY_PATHS = {
  deals: '/api/v2/deals',
  persons: '/api/v2/persons',
  organizations: '/api/v2/organizations',
  activities: '/api/v2/activities',
  products: '/api/v2/products',
}
const ENTITY_SINGULAR = {
  deals: 'deal',
  persons: 'person',
  organizations: 'organization',
  activities: 'activity',
  products: 'product',
}

/**
 * Test seams, overridden per-test and reset afterwards. Keeping them on a
 * single mutable object lets the command run its real code paths (server bind,
 * signal registration, poll loop) while a test drives them deterministically.
 * @type {{ signals?: import('node:events').EventEmitter, onListening?: (port: number) => void, sleep?: (ms: number) => Promise<void> }}
 */
export const testHooks = {
  signals: undefined,
  onListening: undefined,
  sleep: undefined,
}

/**
 * Does `event` ("deal.change") match any of the `entity.action` patterns?
 * `*` is a wildcard on either side; a bare `entity` means `entity.*`. An empty
 * pattern list matches everything.
 * @param {string} event
 * @param {string[]} [patterns]
 * @returns {boolean}
 */
export function matchesEvents(event, patterns) {
  if (!patterns || patterns.length === 0) return true
  const [entity, action] = event.split('.')
  return patterns.some((p) => {
    const [pe, pa] = p.split('.')
    return (
      (pe === '*' || pe === entity) &&
      (pa == null || pa === '*' || pa === action)
    )
  })
}

/**
 * Derive an `entity.action` key from a delivery payload, tolerating the v2
 * (`meta.entity`/`meta.action`) shape and unknown/legacy payloads.
 * @param {object|null} payload
 * @returns {string}
 */
export function eventKey(payload) {
  const meta = payload?.meta ?? {}
  const entity = meta.entity ?? 'unknown'
  const action = meta.action ?? 'unknown'
  return `${entity}.${action}`
}

/**
 * Build the webhook-delivery envelope a real webhook would send for a changed
 * record: `{ event, meta, current, previous }`. `previous` is null — the feed
 * carries only the current state.
 * @param {string} entity plural entity name (deals, persons, …)
 * @param {object} record the changed record
 * @param {string|null} since boundary used to classify create vs change
 * @returns {{ event: string, meta: object, current: object, previous: null }}
 */
export function toSyntheticEvent(entity, record, since) {
  const singular = ENTITY_SINGULAR[entity]
  const action =
    categorizeChange(record, since) === 'created' ? 'create' : 'change'
  return {
    event: `${singular}.${action}`,
    meta: {
      action,
      entity: singular,
      id: record.id,
      updateTime: record.update_time ?? null,
    },
    current: record,
    previous: null,
  }
}

/**
 * Ascending-by-update_time comparator for synthetic events; events with no
 * update_time sort last. Kept pure and exported so every ordering branch is
 * covered independently of the engine's sort argument order.
 * @param {{ meta: { updateTime: string|null } }} a
 * @param {{ meta: { updateTime: string|null } }} b
 * @returns {number}
 */
export function compareByUpdateTime(a, b) {
  const au = a.meta.updateTime
  const bu = b.meta.updateTime
  if (au == null) return bu == null ? 0 : 1
  if (bu == null) return -1
  return au.localeCompare(bu)
}

/**
 * One-line human summary of a delivery for a TTY.
 * @param {object|null} payload
 * @returns {string}
 */
export function formatDeliveryLine(payload) {
  const key = eventKey(payload)
  const id = payload?.meta?.id ?? payload?.current?.id
  const when = new Date().toISOString()
  const suffix = id == null ? '' : ` ${chalk.dim(`#${id}`)}`
  return `${chalk.dim(when)}  ${chalk.cyan(key)}${suffix}`
}

/**
 * POST a payload to the --forward-to sink. Forwarding is best-effort: a failed
 * relay must never sink the listener, so errors are logged and swallowed.
 * @param {string} url
 * @param {string} body
 * @param {string} [contentType]
 */
async function forwardEvent(url, body, contentType) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': contentType ?? 'application/json' },
      body,
    })
  } catch (err) {
    process.stderr.write(`forward-to failed: ${err.message}\n`)
  }
}

export default class WebhookListenCommand extends BaseCommand {
  static description =
    'Run a local webhook dev loop. In tunnel mode it registers a temporary ' +
    'Pipedrive webhook pointing at your public tunnel (--url) and prints/forwards ' +
    'each delivery, deleting the webhook on exit. In --synthetic mode it polls the ' +
    'changes feed instead and emits the same delivery envelope with zero inbound ' +
    'network — useful behind a firewall or for reactive agents.'

  static examples = [
    '<%= config.bin %> webhook listen --url https://abc123.ngrok.app --forward-to http://localhost:3000',
    '<%= config.bin %> webhook listen --url https://abc123.ngrok.app --events deal.change,person.*',
    '<%= config.bin %> webhook listen --synthetic --since 15m',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    url: Flags.string({
      description:
        'Public tunnel URL that forwards to the local receiver (tunnel mode)',
      exclusive: ['synthetic'],
    }),
    'forward-to': Flags.string({
      description: 'POST each delivery to this local URL as well',
    }),
    events: Flags.string({
      description:
        'Comma-separated entity.action filters, e.g. deal.change,person.*',
    }),
    port: Flags.integer({
      description: 'Local receiver port (tunnel mode)',
      default: DEFAULT_PORT,
    }),
    synthetic: Flags.boolean({
      description:
        'Poll the changes feed and emit webhook-shaped events (no inbound network)',
      default: false,
      exclusive: ['url'],
    }),
    since: Flags.string({
      description:
        'Synthetic start point: RFC3339 timestamp or Nd/Nm (else the stored watermark)',
    }),
    interval: Flags.integer({
      description: 'Milliseconds between synthetic poll cycles',
      default: DEFAULT_INTERVAL_MS,
    }),
    once: Flags.boolean({
      description: 'Process a single delivery / poll cycle then exit',
      default: false,
    }),
    'max-events': Flags.integer({
      description: 'Exit after emitting this many events',
      min: 1,
    }),
  }

  async run() {
    const { flags } = await this.parse(WebhookListenCommand)
    if (flags.synthetic) return this.runSynthetic(flags)
    if (!flags.url) {
      throw new CliError(
        'Provide --url <public-tunnel-url> for tunnel mode, or --synthetic to poll the changes feed',
        { exitCode: 64 },
      )
    }
    return this.runTunnel(flags)
  }

  /**
   * Print (and optionally forward) a single delivery, honoring the --events
   * filter. Returns whether the event passed the filter (i.e. was emitted).
   * @param {object|null} payload
   * @param {{ format: string, patterns: string[] }} ctx
   * @returns {boolean}
   */
  emitEvent(payload, { format, patterns }) {
    if (!matchesEvents(eventKey(payload), patterns)) return false
    this.log(
      format === 'table'
        ? formatDeliveryLine(payload)
        : JSON.stringify(payload),
    )
    return true
  }

  /**
   * Delete leftover pdcli-listen webhooks from a previous crashed run. Best
   * effort: a failed list must not block starting a fresh listener.
   * @param {string} profile
   */
  async sweepOrphans(profile) {
    const storedId = getProfileConfig(profile, LISTEN_ID_KEY)
    let list
    try {
      const body = await this.apiClient.get('/api/v1/webhooks')
      list = body?.data ?? []
    } catch (err) {
      process.stderr.write(`Orphan sweep skipped: ${err.message}\n`)
      return
    }
    const orphans = list.filter(
      (w) => w.name === MARKER || (storedId != null && w.id === storedId),
    )
    for (const w of orphans) {
      try {
        await this.apiClient.del(`/api/v1/webhooks/${w.id}`)
        process.stderr.write(`Swept orphaned listen webhook ${w.id}\n`)
      } catch (err) {
        process.stderr.write(
          `Could not sweep webhook ${w.id}: ${err.message}\n`,
        )
      }
    }
    if (storedId != null) deleteProfileConfig(profile, LISTEN_ID_KEY)
  }

  /**
   * Tunnel mode: bind a local receiver, register a temp catch-all webhook at
   * the user's tunnel URL, print/forward deliveries, and guarantee the webhook
   * is deleted on shutdown (signal or --once/--max-events).
   * @param {object} flags
   */
  async runTunnel(flags) {
    const format = this.resolveFormat()
    const patterns = flags.events
      ? flags.events
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const profile = this.activeProfile
    const forwardTo = flags['forward-to']
    const signals = testHooks.signals ?? process

    await this.sweepOrphans(profile)

    return new Promise((resolve, reject) => {
      let webhookId
      let count = 0
      let closing = false

      const shutdown = async (signal) => {
        if (closing) return
        closing = true
        server.close()
        try {
          await this.apiClient.del(`/api/v1/webhooks/${webhookId}`)
          deleteProfileConfig(profile, LISTEN_ID_KEY)
        } catch (err) {
          process.stderr.write(
            `Cleanup of webhook ${webhookId} failed: ${err.message}\n`,
          )
        }
        // Deregister after cleanup: while the async delete is in flight the
        // `closing` guard (not listener removal) dedupes a second signal.
        signals.off('SIGINT', onSigint)
        signals.off('SIGTERM', onSigterm)
        if (signal) {
          process.stderr.write(
            `\nReceived ${signal} — deleted webhook ${webhookId}\n`,
          )
        }
        resolve()
      }
      const onSigint = () => shutdown('SIGINT')
      const onSigterm = () => shutdown('SIGTERM')

      const server = createServer((req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', async () => {
          res.writeHead(200)
          res.end()
          const raw = Buffer.concat(chunks).toString('utf8')
          let payload
          try {
            payload = JSON.parse(raw)
          } catch {
            payload = { raw }
          }
          if (this.emitEvent(payload, { format, patterns })) {
            if (forwardTo) {
              await forwardEvent(forwardTo, raw, req.headers['content-type'])
            }
            count++
            if (
              flags.once ||
              (flags['max-events'] != null && count >= flags['max-events'])
            ) {
              await shutdown()
            }
          }
        })
      })

      server.on('error', (err) => {
        reject(
          new CliError(
            `Cannot bind the local receiver on port ${flags.port}: ${err.message}`,
            {
              exitCode: 78,
            },
          ),
        )
      })

      // Bind loopback only: a tunnel (ngrok/cloudflared) forwards to localhost,
      // so there's no reason to expose the receiver on other interfaces — and
      // it makes an in-use port fail deterministically across OSes.
      server.listen(flags.port, '127.0.0.1', async () => {
        const port = server.address().port
        try {
          const created = await this.apiClient.post('/api/v1/webhooks', {
            body: {
              subscription_url: flags.url,
              event_action: '*',
              event_object: '*',
              version: '2.0',
              name: MARKER,
            },
          })
          webhookId = created.data.id
        } catch (err) {
          server.close()
          reject(err)
          return
        }
        setProfileConfig(profile, LISTEN_ID_KEY, webhookId)
        signals.on('SIGINT', onSigint)
        signals.on('SIGTERM', onSigterm)
        process.stderr.write(
          `Listening on :${port} — webhook ${webhookId} → ${flags.url}\n`,
        )
        testHooks.onListening?.(port)
      })
    })
  }

  /**
   * Synthetic mode: poll the changes feed and emit webhook-shaped envelopes,
   * advancing a resume watermark after each cycle. No inbound network, so it
   * works behind a firewall and for reactive agents.
   * @param {object} flags
   */
  async runSynthetic(flags) {
    const format = this.resolveFormat()
    const patterns = flags.events
      ? flags.events
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const profile = this.activeProfile
    const forwardTo = flags['forward-to']
    const sleep =
      testHooks.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    const signals = testHooks.signals ?? process

    let stopping = false
    const onSignal = () => {
      stopping = true
    }
    signals.on('SIGINT', onSignal)
    signals.on('SIGTERM', onSignal)

    let since
    if (flags.since != null) {
      since = resolveSince(flags.since)
    } else {
      const stored = getProfileConfig(profile, WATERMARK_KEY)
      if (stored == null) {
        signals.off('SIGINT', onSignal)
        signals.off('SIGTERM', onSignal)
        throw new CliError(
          'No stored watermark — pass --since <timestamp|Nd> for the first --synthetic run',
          { exitCode: 64 },
        )
      }
      since = stored
    }

    let count = 0
    try {
      while (!stopping) {
        const events = await this.pollSynthetic(since)
        for (const evt of events) {
          const emitted = this.emitEvent(evt, { format, patterns })
          if (emitted && forwardTo) {
            await forwardEvent(
              forwardTo,
              JSON.stringify(evt),
              'application/json',
            )
          }
          if (evt.meta.updateTime != null) {
            since = formatApiDatetime(
              new Date(new Date(evt.meta.updateTime).getTime() + 1000),
            )
          }
          if (emitted) {
            count++
            if (flags['max-events'] != null && count >= flags['max-events']) {
              stopping = true
              break
            }
          }
        }
        setProfileConfig(profile, WATERMARK_KEY, since)
        if (flags.once || stopping) break
        await sleep(flags.interval)
      }
    } finally {
      signals.off('SIGINT', onSignal)
      signals.off('SIGTERM', onSignal)
    }
  }

  /**
   * Fetch all entities changed since `since` and shape them into
   * webhook-delivery envelopes, sorted by update_time ascending.
   * @param {string} since
   * @returns {Promise<object[]>}
   */
  async pollSynthetic(since) {
    const query = {
      updated_since: since,
      sort_by: 'update_time',
      sort_direction: 'asc',
      limit: 500,
    }
    const events = []
    await Promise.all(
      Object.entries(ENTITY_PATHS).map(async ([entity, path]) => {
        const rows = await collectPages(this.apiClient.pageV2(path, query))
        for (const row of rows)
          events.push(toSyntheticEvent(entity, row, since))
      }),
    )
    events.sort(compareByUpdateTime)
    return events
  }
}
