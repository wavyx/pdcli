import { CliError } from './errors.js'

const NUMERIC_TYPES = new Set(['double', 'monetary', 'int'])

/**
 * Build a write-request body from typed flags, repeatable --field entries,
 * and a raw --body JSON string. Precedence: raw body < typed flags/fields.
 *
 * --field entries are "Name=Value" where Name is a field's human name, its
 * field_code, or a 40-char custom-field hash. Enum labels resolve to option
 * IDs; set values are comma-separated labels; numeric field types coerce to
 * Number. Custom-field values nest under custom_fields (v2 shape).
 *
 * @param {object} options
 * @param {Record<string, unknown>} [options.typed] API-named values from typed flags
 * @param {string[]} [options.fields] repeatable --field "Name=Value" entries
 * @param {string} [options.rawBody] raw JSON string from --body
 * @param {object[]} [options.defs] field definitions (required when fields given)
 * @returns {object} request body
 */
export function buildWriteBody({
  typed = {},
  fields = [],
  rawBody,
  defs,
} = {}) {
  let body = {}

  if (rawBody) {
    try {
      body = JSON.parse(rawBody)
    } catch (err) {
      throw new CliError(`--body is not valid JSON: ${err.message}`, {
        exitCode: 65,
      })
    }
  }

  for (const [key, value] of Object.entries(typed)) {
    if (value !== undefined) body[key] = value
  }

  for (const entry of fields) {
    const eq = entry.indexOf('=')
    if (eq === -1) {
      throw new CliError(`Invalid --field "${entry}". Expected Name=Value`, {
        exitCode: 64,
      })
    }
    const name = entry.slice(0, eq).trim()
    const rawValue = entry.slice(eq + 1)

    const def = findField(defs ?? [], name)
    if (!def) {
      throw new CliError(
        `Unknown field "${name}". Run: pdcli field list <entity>`,
        { exitCode: 65 },
      )
    }

    const value = coerceValue(def, rawValue)

    if (def.is_custom_field ?? isHashKey(def.field_code)) {
      body.custom_fields ??= {}
      body.custom_fields[def.field_code] = value
    } else {
      body[def.field_code] = value
    }
  }

  return body
}

function isHashKey(s) {
  return /^[a-f0-9]{40}$/.test(s)
}

function findField(defs, name) {
  const lower = name.toLowerCase()
  return defs.find(
    (d) => d.field_name.toLowerCase() === lower || d.field_code === name,
  )
}

function coerceValue(def, rawValue) {
  if (def.field_type === 'enum') {
    return resolveOption(def, rawValue)
  }
  if (def.field_type === 'set') {
    return rawValue.split(',').map((label) => resolveOption(def, label.trim()))
  }
  if (NUMERIC_TYPES.has(def.field_type)) {
    return Number(rawValue)
  }
  return rawValue
}

function resolveOption(def, label) {
  const option = def.options?.find(
    (o) => o.label.toLowerCase() === label.toLowerCase(),
  )
  if (!option) {
    const valid = def.options?.map((o) => o.label).join(', ') ?? '(none)'
    throw new CliError(
      `Unknown option "${label}" for field "${def.field_name}". Valid: ${valid}`,
      { exitCode: 65 },
    )
  }
  return option.id
}
