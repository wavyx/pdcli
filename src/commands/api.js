import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { resolveBody } from '../lib/body.js'
import { CliError } from '../lib/errors.js'
import { collectPages } from '../lib/pagination.js'

export default class ApiCommand extends BaseCommand {
  static description =
    'Make a raw API request (host-locked to your Pipedrive company domain)'

  static examples = [
    '<%= config.bin %> api GET /api/v2/deals',
    '<%= config.bin %> api GET /api/v1/currencies',
    '<%= config.bin %> api POST /api/v2/deals --body \'{"title":"New deal"}\'',
    '<%= config.bin %> api DELETE /api/v1/webhooks/1',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    body: Flags.string({
      description: 'Request body (JSON string, @file, or pipe stdin)',
    }),
    paginate: Flags.boolean({
      aliases: ['all'],
      description:
        'Follow pagination and collect every page into one array (GET only; ' +
        'pager inferred from the /api/v1/ or /api/v2/ path)',
    }),
  }

  static args = {
    method: Args.string({
      required: true,
      description: 'HTTP method',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
    path: Args.string({
      required: true,
      description: 'API path (e.g. /api/v2/deals — v1 and v2 both work)',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(ApiCommand)

    if (flags.paginate) {
      return this.runPaginated(args.method, args.path)
    }

    const methodMap = {
      GET: 'get',
      POST: 'post',
      PUT: 'put',
      PATCH: 'patch',
      DELETE: 'del',
    }

    const method = methodMap[args.method]
    const opts = {}

    // Resolve the body for any method that carries one — from --body, @file,
    // or piped stdin (resolveBody handles all three; it errors when a body is
    // required but none is given). Previously this was gated on `flags.body`,
    // so the documented "pipe stdin" path was unreachable.
    if (!['GET', 'DELETE'].includes(args.method)) {
      const bodyText = await resolveBody(flags)
      try {
        opts.body = JSON.parse(bodyText)
      } catch (err) {
        throw new CliError(`--body is not valid JSON: ${err.message}`, {
          exitCode: 65,
        })
      }
    }

    const data = await this.apiClient[method](args.path, opts)

    if (data === null) return

    if (this.flags.jq) {
      await this.outputResults(data, {})
      return
    }
    this.log(JSON.stringify(data, null, 2))
  }

  /**
   * Follow pagination for a GET passthrough and print the collected array.
   * The pager is inferred from the path (v2 cursor for /api/v2/, v1 offset for
   * /api/v1/); any querystring already on the path seeds the first page. The
   * global --limit caps the total items collected (all pages when unset).
   * @param {string} method
   * @param {string} path
   */
  async runPaginated(method, path) {
    if (method !== 'GET') {
      throw new CliError('--paginate is only valid with GET', { exitCode: 64 })
    }

    // Peel any querystring off the path into a seed query object — the pagers
    // append cursor/start themselves. A dummy base makes relative paths parse.
    const url = new URL(path, 'http://pdcli.invalid')
    const query = Object.fromEntries(url.searchParams)
    const cleanPath = url.pathname

    let pager
    if (cleanPath.includes('/api/v2/')) pager = this.apiClient.pageV2
    else if (cleanPath.includes('/api/v1/')) pager = this.apiClient.pageV1
    else {
      throw new CliError(
        `Cannot infer the pager for ${path} — --paginate needs an ` +
          `/api/v1/ or /api/v2/ path`,
        { exitCode: 64 },
      )
    }

    const items = await collectPages(pager(cleanPath, query), this.flags.limit)

    if (this.flags.jq || this.flags.output) {
      await this.outputResults(items, {})
      return
    }
    this.log(JSON.stringify(items, null, 2))
  }
}
