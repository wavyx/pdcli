export class CliError extends Error {
  /** @param {string} message @param {{exitCode?: number, cause?: Error}} [options] */
  constructor(message, { exitCode = 1, cause } = {}) {
    super(message, { cause })
    this.exitCode = exitCode
  }
}

export class AuthRequiredError extends CliError {
  constructor() {
    super('Not authenticated. Run: pdcli auth login', { exitCode: 77 })
  }
}

export class ConfigError extends CliError {
  /** @param {string} message */
  constructor(message) {
    super(message, { exitCode: 78 })
  }
}

export class RateLimitError extends CliError {
  /** @param {number} retryAfter */
  constructor(retryAfter) {
    super(`Rate limited. Retry after ${retryAfter}s`, { exitCode: 75 })
    this.retryAfter = retryAfter
  }
}

export class ServiceUnavailableError extends CliError {
  constructor() {
    super('Pipedrive API is unavailable', { exitCode: 69 })
  }
}

/** Exit-code ladder per spec §9 (sysexits). */
function exitCodeForStatus(statusCode) {
  if (statusCode === 400 || statusCode === 422) return 65
  if (statusCode === 401 || statusCode === 403) return 77
  if (statusCode === 402) return 78
  if (statusCode === 429) return 75
  if (statusCode >= 500) return 69
  return 1
}

export class ApiError extends CliError {
  /**
   * @param {number} statusCode
   * @param {object} body Pipedrive error envelope { success, error, error_info }
   * @param {string} path
   */
  constructor(statusCode, body, path) {
    const message = body?.error || body?.message || `API error ${statusCode}`

    super(`Pipedrive API ${statusCode}: ${message}`, {
      exitCode: exitCodeForStatus(statusCode),
    })
    this.statusCode = statusCode
    this.path = path
    this.body = body
    this.errorInfo = body?.error_info
  }

  /**
   * @param {number} statusCode
   * @param {string} text
   * @param {string} path
   */
  static fromResponse(statusCode, text, path) {
    let body
    try {
      body = JSON.parse(text)
    } catch {
      // Non-JSON bodies (e.g. HTML error pages) can be huge — truncate.
      const truncated = text.length > 200 ? `${text.slice(0, 200)}…` : text
      body = { message: truncated }
    }
    return new ApiError(statusCode, body, path)
  }
}

/**
 * @param {Error} err
 * @param {import('@oclif/core').Command} cmd
 */
export function handleError(err, cmd) {
  const exitCode = err.exitCode ?? 70
  const flags = cmd.flags ?? {}

  // JSON errors when the user asked for JSON — via the flag or the
  // profile's default_output. (The piped-TTY fallback intentionally does
  // NOT apply here; errors stay human unless JSON was requested.)
  const format =
    flags.output ??
    (typeof cmd.storedDefaultOutput === 'function'
      ? cmd.storedDefaultOutput()
      : undefined)

  if (format === 'json') {
    const payload = {
      error: err.constructor.name,
      message: err.message,
      exitCode,
    }
    if (err instanceof ApiError) {
      payload.statusCode = err.statusCode
      payload.path = err.path
      if (err.errorInfo) payload.errorInfo = err.errorInfo
      if (flags.verbose) payload.body = err.body
    }
    process.stderr.write(JSON.stringify(payload, null, 2) + '\n')
    cmd.exit(exitCode)
  }

  if (flags.verbose && err instanceof ApiError) {
    process.stderr.write(`\nRequest path: ${err.path}\n`)
    process.stderr.write(`Status code:  ${err.statusCode}\n`)
    if (err.errorInfo) process.stderr.write(`Error info:   ${err.errorInfo}\n`)
    if (err.body) {
      process.stderr.write(
        `Response body:\n${JSON.stringify(err.body, null, 2)}\n`,
      )
    }
  }

  cmd.error(err.message, { exit: exitCode })
}
