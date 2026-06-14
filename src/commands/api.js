import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { resolveBody } from '../lib/body.js'
import { CliError } from '../lib/errors.js'

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
}
