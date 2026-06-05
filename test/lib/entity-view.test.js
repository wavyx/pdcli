import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearFieldsCache } from '../../src/lib/fields.js'
import { outputRecord } from '../../src/lib/entity-view.js'

const HASH = 'dcf558aac1ae4e8c4f849ba5e668430d8df9be12'

const FIELD_DEFS = [
  {
    id: 2,
    field_code: HASH,
    field_name: 'Deal Size',
    field_type: 'enum',
    options: [
      { id: 10, label: 'Small' },
      { id: 11, label: 'Large' },
    ],
  },
]

/**
 * Build a fake cmd that records the object handed to outputResults.
 * @param {{ format?: string, resolveFields?: boolean, defs?: object[] }} [opts]
 */
function fakeCmd({
  format = 'json',
  resolveFields = false,
  defs = FIELD_DEFS,
} = {}) {
  const captured = { data: undefined, columns: undefined }
  return {
    captured,
    flags: { 'resolve-fields': resolveFields },
    resolveFormat: () => format,
    apiClient: {
      pageV2: vi.fn(async function* () {
        yield* defs
      }),
    },
    outputResults: vi.fn(async (data, columns) => {
      captured.data = data
      captured.columns = columns
    }),
  }
}

describe('outputRecord --resolve-fields (non-table formats)', () => {
  beforeEach(() => {
    clearFieldsCache()
  })

  it('resolves hash keys and option ids to names/labels when the flag is on', async () => {
    const cmd = fakeCmd({ format: 'json', resolveFields: true })

    await outputRecord(
      cmd,
      { id: 42, title: 'Answer deal', custom_fields: { [HASH]: 11 } },
      'deal',
    )

    expect(cmd.apiClient.pageV2).toHaveBeenCalledWith('/api/v2/dealFields')
    expect(cmd.captured.data.custom_fields).toEqual({ 'Deal Size': 'Large' })
    // non-custom keys untouched
    expect(cmd.captured.data.id).toBe(42)
    expect(cmd.captured.data.title).toBe('Answer deal')
  })

  it('leaves custom_fields raw when the flag is off (byte-for-byte unchanged)', async () => {
    const cmd = fakeCmd({ format: 'json', resolveFields: false })

    await outputRecord(cmd, { id: 42, custom_fields: { [HASH]: 11 } }, 'deal')

    expect(cmd.apiClient.pageV2).not.toHaveBeenCalled()
    expect(cmd.captured.data.custom_fields).toEqual({ [HASH]: 11 })
  })

  it('is a no-op when no entity is given even with the flag on', async () => {
    const cmd = fakeCmd({ format: 'json', resolveFields: true })

    await outputRecord(cmd, { id: 1, custom_fields: { [HASH]: 11 } })

    expect(cmd.apiClient.pageV2).not.toHaveBeenCalled()
    expect(cmd.captured.data.custom_fields).toEqual({ [HASH]: 11 })
  })

  it('is a no-op when custom_fields is empty even with the flag on', async () => {
    const cmd = fakeCmd({ format: 'json', resolveFields: true })

    await outputRecord(cmd, { id: 1, custom_fields: {} }, 'deal')

    expect(cmd.apiClient.pageV2).not.toHaveBeenCalled()
    expect(cmd.captured.data.custom_fields).toEqual({})
  })

  it('is a no-op when custom_fields is absent even with the flag on', async () => {
    const cmd = fakeCmd({ format: 'json', resolveFields: true })

    await outputRecord(cmd, { id: 1, title: 'No customs' }, 'deal')

    expect(cmd.apiClient.pageV2).not.toHaveBeenCalled()
    expect(cmd.captured.data).toEqual({ id: 1, title: 'No customs' })
  })

  it('resolves for yaml output too', async () => {
    const cmd = fakeCmd({ format: 'yaml', resolveFields: true })

    await outputRecord(cmd, { custom_fields: { [HASH]: 11 } }, 'deal')

    expect(cmd.captured.data.custom_fields).toEqual({ 'Deal Size': 'Large' })
  })

  it('resolves for csv output too', async () => {
    const cmd = fakeCmd({ format: 'csv', resolveFields: true })

    await outputRecord(cmd, { custom_fields: { [HASH]: 11 } }, 'deal')

    expect(cmd.captured.data.custom_fields).toEqual({ 'Deal Size': 'Large' })
  })
})

describe('outputRecord table mode is unaffected by --resolve-fields', () => {
  beforeEach(() => {
    clearFieldsCache()
  })

  it('still resolves in table mode regardless of the flag', async () => {
    const cmd = fakeCmd({ format: 'table', resolveFields: false })

    await outputRecord(cmd, { custom_fields: { [HASH]: 11 } }, 'deal')

    // table mode flattens; the resolved label appears as a row value
    expect(cmd.captured.data).toContainEqual({
      field: 'Deal Size',
      value: 'Large',
    })
  })
})
