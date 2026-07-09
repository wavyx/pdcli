import { Command, Flags } from '@oclif/core'
import createDebug from 'debug'
import { formatOutput } from './lib/output/index.js'
import { loadConfig } from './lib/config.js'
import { resolveCredentials, refreshAccessToken } from './lib/auth.js'
import { setOAuthTokens } from './lib/keychain.js'
import { createClient } from './lib/client.js'
import { handleError, CliError } from './lib/errors.js'

const debug = createDebug('pd:fields')

/** Default upper bound on a single jq invocation before we treat it as hung. */
const JQ_TIMEOUT_MS = 15_000

/**
 * Run a jq filter, guarding against a missing/broken jq binary. npm >= 11 blocks
 * node-jq's preinstall, so a globally installed pdcli can ship without the jq
 * binary at node_modules/node-jq/bin/jq. node-jq's run() then does NOT reject on
 * the spawn ENOENT — it hangs forever. Bound it: race the run against a timeout
 * and translate any rejection OR timeout into a clear, deterministic error
 * (EX_UNAVAILABLE 69) so `--jq` fails fast instead of hanging. The timeout is
 * overridable via PDCLI_JQ_TIMEOUT_MS (ms) for slow machines / tests.
 * @param {string} filter jq expression
 * @param {string} input JSON string
 * @returns {Promise<string>}
 */
async function runJq(filter, input) {
  const timeoutMs = Number(process.env.PDCLI_JQ_TIMEOUT_MS) || JQ_TIMEOUT_MS
  const { run } = await import('node-jq')
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`jq did not respond within ${timeoutMs}ms`)),
      timeoutMs,
    )
    timer.unref?.() // never keep the event loop alive just for this guard
  })
  try {
    return await Promise.race([
      run(filter, input, { input: 'string', output: 'pretty' }),
      timeout,
    ])
  } catch (cause) {
    throw new CliError(
      'jq is unavailable — the jq binary may be missing or failed to run. ' +
        'Try: npm rebuild node-jq, or install jq.',
      { exitCode: 69, cause },
    )
  } finally {
    clearTimeout(timer)
  }
}

export default class BaseCommand extends Command {
  static baseFlags = {
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      helpGroup: 'GLOBAL',
      options: ['table', 'json', 'yaml', 'csv'],
    }),
    jq: Flags.string({
      description: 'jq expression to filter JSON output',
      helpGroup: 'GLOBAL',
    }),
    fields: Flags.string({
      description: 'Comma-separated fields to display',
      helpGroup: 'GLOBAL',
    }),
    'resolve-fields': Flags.boolean({
      description:
        'Resolve custom-field hash keys to names (and option ids to labels) in json/yaml/csv output of get and core list commands',
      helpGroup: 'GLOBAL',
      default: false,
    }),
    profile: Flags.string({
      description: 'Named auth profile to use',
      helpGroup: 'GLOBAL',
      env: 'PDCLI_PROFILE',
    }),
    'no-color': Flags.boolean({
      description: 'Disable color output',
      helpGroup: 'GLOBAL',
    }),
    verbose: Flags.boolean({
      description: 'Show detailed API request/response on errors',
      helpGroup: 'GLOBAL',
      default: false,
    }),
    'no-retry': Flags.boolean({
      description: 'Disable automatic retry on rate limits and 5xx errors',
      helpGroup: 'GLOBAL',
      default: false,
    }),
    timeout: Flags.integer({
      description: 'Request timeout in milliseconds',
      helpGroup: 'GLOBAL',
    }),
    limit: Flags.integer({
      description: 'Maximum number of items to return (lists)',
      helpGroup: 'GLOBAL',
      min: 1,
    }),
  }

  /** @type {string} */
  activeProfile
  /** @type {ReturnType<import('./lib/client.js').createClient>} */
  apiClient

  async init() {
    await super.init()
    const { flags } = await this.parse(/** @type {any} */ (this.constructor))
    this.flags = flags

    if (flags['no-color'] || process.env.NO_COLOR) {
      process.env.FORCE_COLOR = '0'
    }

    if (flags.verbose) {
      process.env.DEBUG = process.env.DEBUG
        ? `${process.env.DEBUG},pd:*`
        : 'pd:*'
    }

    const config = loadConfig(flags.profile)
    this.activeProfile = config.activeProfile

    if (this.constructor.skipAuth) return

    const creds = await resolveCredentials({
      flags,
      profile: this.activeProfile,
    })

    const common = {
      retry: !flags['no-retry'],
      timeout: flags.timeout,
      userAgent: `pdcli/${this.config.version}`,
    }

    if (creds.mode === 'oauth') {
      this.apiClient = createClient({
        ...common,
        apiDomain: creds.apiDomain,
        token: creds.token,
        authMode: 'oauth',
        onRefresh: async () => {
          const refreshed = await refreshAccessToken({
            refreshToken: creds.oauth.refreshToken,
            clientId: creds.oauth.clientId,
            clientSecret: creds.oauth.clientSecret,
          })
          await setOAuthTokens(this.activeProfile, {
            ...creds.oauth,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: Date.now() + refreshed.expiresIn * 1000,
          })
          return refreshed.accessToken
        },
      })
      return
    }

    this.apiClient = createClient({
      ...common,
      companyDomain: creds.companyDomain,
      token: creds.token,
    })
  }

  /**
   * The profile's `default_output` config value, when valid. Safe to call
   * before parsing completes (handleError runs for parse failures too,
   * when `this.flags` is still undefined).
   */
  storedDefaultOutput() {
    let stored
    try {
      stored = loadConfig(this.flags?.profile).default_output
    } catch {
      // The error handler consults this while reporting another failure — a
      // broken/unreadable config must never crash error reporting itself.
      return undefined
    }
    return ['table', 'json', 'yaml', 'csv'].includes(stored)
      ? stored
      : undefined
  }

  /**
   * Effective output format: explicit flag, else the profile's
   * `default_output`, else table in a TTY and json when piped.
   */
  resolveFormat() {
    return (
      this.flags.output ??
      this.storedDefaultOutput() ??
      (process.stdout.isTTY ? 'table' : 'json')
    )
  }

  /**
   * @param {object | object[]} data
   * @param {Record<string, import('./lib/output/table.js').Column>} columns
   * @param {{ entity?: string }} [options] entity context enables
   *   --resolve-fields custom-field resolution on machine-format lists
   */
  async outputResults(data, columns, { entity } = {}) {
    if (
      entity &&
      this.flags['resolve-fields'] &&
      this.resolveFormat() !== 'table' &&
      Array.isArray(data) &&
      data.some((row) => row?.custom_fields)
    ) {
      try {
        const { getFields, makeResolver } = await import('./lib/fields.js')
        // getFields is memoized per run — one defs fetch covers the whole list.
        const resolver = makeResolver(await getFields(this.apiClient, entity))
        data = data.map((row) =>
          row?.custom_fields ? resolver.resolveCustomFields(row) : row,
        )
      } catch (err) {
        // Best-effort: the rows already arrived; a failed defs fetch (403
        // restricted, late 429, transient 5xx) must not sink the whole list.
        // Fall back to the raw hash keys instead.
        debug(
          '--resolve-fields skipped, field defs unavailable: %s',
          err.message,
        )
      }
    }

    if (this.flags.jq) {
      // node-jq ships a native binary — load it only when actually used.
      // Single records pass UNWRAPPED: `--jq .id` works on a get without
      // the historical `.[0]` indirection (changed in 0.9.0). runJq bounds the
      // call so a missing/broken jq binary fails fast instead of hanging.
      this.log(await runJq(this.flags.jq, JSON.stringify(data)))
      return
    }

    let filteredColumns = columns
    let outData = data
    if (this.flags.fields) {
      const requested = this.flags.fields.split(',').map((f) => f.trim())
      filteredColumns = Object.fromEntries(
        Object.entries(columns).filter(([key]) => requested.includes(key)),
      )
      // table/csv project through `columns`; json/yaml serialize the data
      // as-is, so project the records themselves (by key) — otherwise --fields
      // is silently ignored for exactly the machine consumers it serves.
      // `Object(row)` keeps the pick null/primitive-safe without a branch.
      const format = this.resolveFormat()
      if (format === 'json' || format === 'yaml') {
        const pick = (row) =>
          Object.fromEntries(
            requested.filter((k) => k in Object(row)).map((k) => [k, row[k]]),
          )
        outData = Array.isArray(data) ? data.map(pick) : pick(data)
      }
    }

    formatOutput(outData, filteredColumns, this.resolveFormat(), this)
  }

  /**
   * Report the result of a mutating action. In interactive table mode it
   * prints the human one-liner; in any machine format (explicit --output, a
   * json/yaml/csv profile default, or piped) it emits `machineObject` through
   * outputResults so `--output json | jq`, --fields and --jq all work — a
   * delete/convert/import is no longer prose-only on stdout.
   * @param {object} machineObject the structured result (e.g. { deleted: id })
   * @param {string} humanMessage the interactive one-liner
   */
  async outputAction(machineObject, humanMessage) {
    if (this.resolveFormat() === 'table') {
      this.log(humanMessage)
      return
    }
    await this.outputResults(machineObject, {})
  }

  async catch(err) {
    handleError(err, this)
  }
}
