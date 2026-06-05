import { getConf } from './config.js'

export function getAliases() {
  return getConf().get('aliases') ?? {}
}

/**
 * @param {string} name
 * @returns {string | undefined}
 */
export function getAlias(name) {
  return getAliases()[name]
}

/**
 * Write the whole `aliases` object back with a literal key, rather than a
 * dotted-path write. conf splits `set('aliases.<name>', …)` on every '.', so a
 * dotted-path write would corrupt any name containing a dot (store/read
 * mismatch). Mutating the object and writing it whole keeps odd names flat.
 * @param {string} name
 * @param {string} command
 */
export function setAlias(name, command) {
  const aliases = { ...getAliases(), [name]: command }
  getConf().set('aliases', aliases)
}

/**
 * @param {string} name
 */
export function unsetAlias(name) {
  const aliases = { ...getAliases() }
  delete aliases[name]
  getConf().set('aliases', aliases)
}
