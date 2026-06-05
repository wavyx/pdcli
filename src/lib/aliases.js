import fs from 'node:fs'
import { getConf } from './config.js'
import { CliError } from './errors.js'

const LOCK_STALE_MS = 5000
const LOCK_RETRIES = 8
const LOCK_RETRY_MS = 50

/** Synchronous sleep for the short lock-retry loop (no event-loop yield needed). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Release the lock; the dir being gone already (stale-broken) is benign. */
function releaseLock(lockDir) {
  try {
    fs.rmdirSync(lockDir)
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
}

/**
 * Advisory lock around alias mutations: a lock DIRECTORY next to the conf
 * file (mkdir is atomic on every platform we support). Protects concurrent
 * pdcli processes from clobbering each other's read-modify-write of the
 * aliases object — advisory only; other writers aren't covered. A lock left
 * behind by a crashed process goes stale after 5s and is broken.
 * @param {() => void} fn the mutation to run while holding the lock
 */
function withAliasLock(fn) {
  const lockDir = `${getConf().path}.aliases.lock`

  for (let attempt = 0; attempt <= LOCK_RETRIES; attempt++) {
    try {
      fs.mkdirSync(lockDir)
      try {
        fn()
        return
      } finally {
        releaseLock(lockDir)
      }
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err
      // Held by someone else — break it if stale, otherwise wait and retry.
      try {
        const age = Date.now() - fs.statSync(lockDir).mtimeMs
        if (age > LOCK_STALE_MS) {
          fs.rmdirSync(lockDir)
          continue
        }
      } catch {
        continue // lock vanished between mkdir and stat — retry immediately
      }
      if (attempt < LOCK_RETRIES) sleepSync(LOCK_RETRY_MS)
    }
  }

  throw new CliError(
    'another pdcli process is updating aliases — retry in a moment',
    { exitCode: 75 },
  )
}

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
 * The read-modify-write runs under an advisory lock so concurrent pdcli
 * processes can't clobber each other.
 * @param {string} name
 * @param {string} command
 */
export function setAlias(name, command) {
  withAliasLock(() => {
    const aliases = { ...getAliases(), [name]: command }
    getConf().set('aliases', aliases)
  })
}

/**
 * @param {string} name
 */
export function unsetAlias(name) {
  withAliasLock(() => {
    const aliases = { ...getAliases() }
    delete aliases[name]
    getConf().set('aliases', aliases)
  })
}
