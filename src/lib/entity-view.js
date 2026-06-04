import { getFields, makeResolver } from './fields.js'
import { flattenRecord } from './output/record.js'

/**
 * Output a single entity record: raw JSON for scripting, or a transposed
 * field/value table with custom-field hash keys and option IDs resolved.
 * @param {import('../base-command.js').default} cmd
 * @param {object} record
 * @param {string} [entity] deal | person | org | activity | product — omit
 *   for entities without resolvable custom fields (notes, files, webhooks, …)
 */
export async function outputRecord(cmd, record, entity) {
  if (cmd.resolveFormat() === 'table') {
    if (
      entity &&
      record.custom_fields &&
      Object.keys(record.custom_fields).length
    ) {
      const defs = await getFields(cmd.apiClient, entity)
      record = makeResolver(defs).resolveCustomFields(record)
    }
    await cmd.outputResults(flattenRecord(record), {
      field: { header: 'Field' },
      value: { header: 'Value' },
    })
    return
  }

  await cmd.outputResults(record, {})
}

/**
 * Fetch field definitions only when --field entries are present.
 * @param {import('../base-command.js').default} cmd
 * @param {string} entity
 * @param {string[]} [fieldFlags]
 * @returns {Promise<object[] | undefined>}
 */
export async function defsForFields(cmd, entity, fieldFlags) {
  if (!fieldFlags?.length) return undefined
  return getFields(cmd.apiClient, entity)
}
