/**
 * @param {string} message
 * @param {boolean} skipConfirm
 * @param {{ default?: boolean }} [options] Forwarded to the inquirer prompt.
 *   Omit to preserve inquirer's native default (true).
 * @returns {Promise<boolean>}
 */
export async function confirmAction(message, skipConfirm, options) {
  if (skipConfirm) return true
  const { confirm } = await import('@inquirer/prompts')
  const promptOptions = { message }
  if (options && Object.prototype.hasOwnProperty.call(options, 'default')) {
    promptOptions.default = options.default
  }
  return confirm(promptOptions)
}
