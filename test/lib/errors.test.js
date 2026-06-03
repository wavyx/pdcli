import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  CliError,
  AuthRequiredError,
  ConfigError,
  RateLimitError,
  ServiceUnavailableError,
  ApiError,
  handleError,
} from '../../src/lib/errors.js'

describe('CliError', () => {
  it('sets message and default exitCode', () => {
    const err = new CliError('something broke')
    expect(err.message).toBe('something broke')
    expect(err.exitCode).toBe(1)
    expect(err).toBeInstanceOf(Error)
  })

  it('accepts a custom exitCode', () => {
    const err = new CliError('custom', { exitCode: 42 })
    expect(err.exitCode).toBe(42)
  })

  it('accepts a cause option', () => {
    const cause = new Error('root cause')
    const err = new CliError('wrapper', { cause })
    expect(err.cause).toBe(cause)
  })
})

describe('AuthRequiredError', () => {
  it('has exitCode 77 and correct message', () => {
    const err = new AuthRequiredError()
    expect(err.exitCode).toBe(77)
    expect(err.message).toBe('Not authenticated. Run: pdcli auth login')
    expect(err).toBeInstanceOf(CliError)
  })
})

describe('ConfigError', () => {
  it('has exitCode 78 and preserves message', () => {
    const err = new ConfigError('bad config')
    expect(err.exitCode).toBe(78)
    expect(err.message).toBe('bad config')
    expect(err).toBeInstanceOf(CliError)
  })
})

describe('RateLimitError', () => {
  it('has exitCode 75 and stores retryAfter', () => {
    const err = new RateLimitError(30)
    expect(err.exitCode).toBe(75)
    expect(err.retryAfter).toBe(30)
    expect(err.message).toBe('Rate limited. Retry after 30s')
    expect(err).toBeInstanceOf(CliError)
  })
})

describe('ServiceUnavailableError', () => {
  it('has exitCode 69 and fixed message', () => {
    const err = new ServiceUnavailableError()
    expect(err.exitCode).toBe(69)
    expect(err.message).toBe('Pipedrive API is unavailable')
    expect(err).toBeInstanceOf(CliError)
  })
})

describe('ApiError', () => {
  it('extracts message from the Pipedrive error field', () => {
    const body = { success: false, error: 'Deal not found' }
    const err = new ApiError(404, body, '/api/v2/deals/1')
    expect(err.message).toBe('Pipedrive API 404: Deal not found')
    expect(err.statusCode).toBe(404)
    expect(err.path).toBe('/api/v2/deals/1')
    expect(err.body).toEqual(body)
  })

  it('falls back to message field when no error field', () => {
    const err = new ApiError(502, { message: 'Bad Gateway' }, '/api/v2/x')
    expect(err.message).toBe('Pipedrive API 502: Bad Gateway')
  })

  it('falls back to generic message when body is empty', () => {
    const err = new ApiError(500, {}, '/api/v2/x')
    expect(err.message).toBe('Pipedrive API 500: API error 500')
  })

  it('stores error_info from body', () => {
    const body = {
      success: false,
      error: 'bad data',
      error_info: 'Please check developers.pipedrive.com',
    }
    const err = new ApiError(400, body, '/api/v2/x')
    expect(err.errorInfo).toBe('Please check developers.pipedrive.com')
  })

  it('sets errorInfo to undefined when body has no error_info', () => {
    const err = new ApiError(500, { error: 'oops' }, '/api/v2/x')
    expect(err.errorInfo).toBeUndefined()
  })

  it('maps 400 to exitCode 65 (validation)', () => {
    expect(new ApiError(400, {}, '/x').exitCode).toBe(65)
  })

  it('maps 422 to exitCode 65 (validation)', () => {
    expect(new ApiError(422, {}, '/x').exitCode).toBe(65)
  })

  it('maps 401 to exitCode 77 (auth)', () => {
    expect(new ApiError(401, {}, '/x').exitCode).toBe(77)
  })

  it('maps 403 to exitCode 77 (permission / rate-limit abuse)', () => {
    expect(new ApiError(403, {}, '/x').exitCode).toBe(77)
  })

  it('maps 402 to exitCode 78 (account not open)', () => {
    expect(new ApiError(402, {}, '/x').exitCode).toBe(78)
  })

  it('maps 429 to exitCode 75 (rate limited)', () => {
    expect(new ApiError(429, {}, '/x').exitCode).toBe(75)
  })

  it('maps 5xx to exitCode 69', () => {
    expect(new ApiError(503, {}, '/x').exitCode).toBe(69)
  })

  it('defaults exitCode to 1 for other status codes', () => {
    expect(new ApiError(404, {}, '/x').exitCode).toBe(1)
    expect(new ApiError(410, {}, '/x').exitCode).toBe(1)
  })

  describe('.fromResponse', () => {
    it('parses JSON body and creates ApiError', () => {
      const text = JSON.stringify({ success: false, error: 'not found' })
      const err = ApiError.fromResponse(404, text, '/api/v2/deals/9')
      expect(err).toBeInstanceOf(ApiError)
      expect(err.statusCode).toBe(404)
      expect(err.body).toEqual({ success: false, error: 'not found' })
      expect(err.message).toBe('Pipedrive API 404: not found')
    })

    it('handles non-JSON text body gracefully', () => {
      const err = ApiError.fromResponse(502, 'Bad Gateway', '/api/v2/x')
      expect(err).toBeInstanceOf(ApiError)
      expect(err.statusCode).toBe(502)
      expect(err.body).toEqual({ message: 'Bad Gateway' })
      expect(err.message).toBe('Pipedrive API 502: Bad Gateway')
    })

    it('maps status codes to correct exit codes', () => {
      expect(ApiError.fromResponse(422, '{}', '/x').exitCode).toBe(65)
      expect(ApiError.fromResponse(403, '{}', '/x').exitCode).toBe(77)
      expect(ApiError.fromResponse(429, '{}', '/x').exitCode).toBe(75)
      expect(ApiError.fromResponse(500, '{}', '/x').exitCode).toBe(69)
    })

    it('extracts error_info from parsed JSON body', () => {
      const text = JSON.stringify({ error: 'err', error_info: 'see docs' })
      const err = ApiError.fromResponse(500, text, '/api/v2/x')
      expect(err.errorInfo).toBe('see docs')
    })
  })
})

describe('handleError', () => {
  let stderrSpy

  afterEach(() => {
    if (stderrSpy) stderrSpy.mockRestore()
  })

  it('delegates to cmd.error with err.message and exitCode for plain CliError', () => {
    const cmd = { flags: {}, error: vi.fn(), exit: vi.fn() }
    const err = new CliError('something broke', { exitCode: 5 })

    handleError(err, cmd)

    expect(cmd.error).toHaveBeenCalledWith('something broke', { exit: 5 })
  })

  it('defaults to exit code 70 when err has no exitCode', () => {
    const cmd = { flags: {}, error: vi.fn(), exit: vi.fn() }
    const err = new Error('unknown')

    handleError(err, cmd)

    expect(cmd.error).toHaveBeenCalledWith('unknown', { exit: 70 })
  })

  it('writes JSON error to stderr when --output json', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = {
      flags: { output: 'json' },
      error: vi.fn(),
      exit: vi.fn((code) => {
        throw new Error(`exit ${code}`)
      }),
    }
    const err = new ApiError(404, { error: 'Not found' }, '/api/v2/x')

    expect(() => handleError(err, cmd)).toThrow('exit 1')

    const output = stderrSpy.mock.calls[0][0]
    const parsed = JSON.parse(output)
    expect(parsed.error).toBe('ApiError')
    expect(parsed.message).toBe('Pipedrive API 404: Not found')
    expect(parsed.statusCode).toBe(404)
    expect(parsed.path).toBe('/api/v2/x')
    expect(parsed.exitCode).toBe(1)
    expect(parsed.body).toBeUndefined() // not included without --verbose
  })

  it('JSON error includes errorInfo when present', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = {
      flags: { output: 'json' },
      error: vi.fn(),
      exit: vi.fn((code) => {
        throw new Error(`exit ${code}`)
      }),
    }
    const err = new ApiError(
      400,
      { error: 'bad', error_info: 'see docs' },
      '/api/v2/x',
    )

    expect(() => handleError(err, cmd)).toThrow('exit 65')

    const output = stderrSpy.mock.calls[0][0]
    const parsed = JSON.parse(output)
    expect(parsed.errorInfo).toBe('see docs')
  })

  it('JSON error includes body when --verbose', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = {
      flags: { output: 'json', verbose: true },
      error: vi.fn(),
      exit: vi.fn((code) => {
        throw new Error(`exit ${code}`)
      }),
    }
    const err = new ApiError(
      422,
      { error: 'Validation', error_info: 'field x' },
      '/api/v2/x',
    )

    expect(() => handleError(err, cmd)).toThrow('exit 65')

    const output = stderrSpy.mock.calls[0][0]
    const parsed = JSON.parse(output)
    expect(parsed.body).toEqual({ error: 'Validation', error_info: 'field x' })
  })

  it('JSON error for non-ApiError omits statusCode/path/body', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = {
      flags: { output: 'json' },
      error: vi.fn(),
      exit: vi.fn((code) => {
        throw new Error(`exit ${code}`)
      }),
    }
    const err = new ConfigError('bad config')

    expect(() => handleError(err, cmd)).toThrow('exit 78')

    const output = stderrSpy.mock.calls[0][0]
    const parsed = JSON.parse(output)
    expect(parsed.error).toBe('ConfigError')
    expect(parsed.message).toBe('bad config')
    expect(parsed.exitCode).toBe(78)
    expect(parsed.statusCode).toBeUndefined()
    expect(parsed.path).toBeUndefined()
    expect(parsed.body).toBeUndefined()
  })

  it('writes verbose request/response details to stderr for ApiError', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = { flags: { verbose: true }, error: vi.fn(), exit: vi.fn() }
    const err = new ApiError(
      500,
      { error: 'oops', error_info: 'try later' },
      '/api/v2/things',
    )

    handleError(err, cmd)

    const writes = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(writes).toContain('Request path: /api/v2/things')
    expect(writes).toContain('Status code:  500')
    expect(writes).toContain('Error info:   try later')
    expect(writes).toContain('Response body:')
    expect(writes).toContain('"error": "oops"')
    expect(cmd.error).toHaveBeenCalledWith(err.message, { exit: 69 })
  })

  it('verbose ApiError with falsy body omits Response body section', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = { flags: { verbose: true }, error: vi.fn(), exit: vi.fn() }
    const err = new ApiError(500, { error: 'x' }, '/api/v2/x')
    err.body = null

    handleError(err, cmd)

    const writes = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(writes).not.toContain('Response body:')
  })

  it('verbose ApiError without error_info omits the error info line', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = { flags: { verbose: true }, error: vi.fn(), exit: vi.fn() }
    const err = new ApiError(404, { error: 'gone' }, '/api/v2/missing')

    handleError(err, cmd)

    const writes = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(writes).toContain('Request path: /api/v2/missing')
    expect(writes).toContain('Status code:  404')
    expect(writes).not.toContain('Error info:')
  })

  it('verbose flag has no effect on non-ApiError', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = { flags: { verbose: true }, error: vi.fn(), exit: vi.fn() }
    const err = new ConfigError('bad')

    handleError(err, cmd)

    expect(stderrSpy).not.toHaveBeenCalled()
    expect(cmd.error).toHaveBeenCalledWith('bad', { exit: 78 })
  })

  it('handles missing cmd.flags by defaulting to plain error', () => {
    const cmd = { error: vi.fn(), exit: vi.fn() }
    const err = new CliError('oh no', { exitCode: 3 })

    handleError(err, cmd)

    expect(cmd.error).toHaveBeenCalledWith('oh no', { exit: 3 })
  })
})
