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
  try {
    return await confirm(promptOptions)
  } catch (err) {
    // Ctrl-C / closed stdin (CI, piping) force-closes the prompt — treat it
    // as a "no" so callers abort cleanly instead of surfacing exit 70.
    if (err?.name === 'ExitPromptError') return false
    throw err
  }
}
