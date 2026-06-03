import createDebug from 'debug'
import { CliError } from './errors.js'

const debug = createDebug('pd:keychain')
const SERVICE = 'pdcli'

/** @type {typeof import('@napi-rs/keyring').Entry | null} */
let Entry = null

try {
  const mod = await import('@napi-rs/keyring')
  Entry = mod.Entry
  debug('using OS keychain via @napi-rs/keyring')
} catch {
  debug('OS keychain unavailable')
}

function getEntry(account) {
  return new Entry(SERVICE, account)
}

function keychainRequired() {
  throw new CliError(
    'OS keychain unavailable. pdcli stores credentials in your operating system ' +
      'keychain (macOS Keychain, Windows Credential Manager, or libsecret on Linux) ' +
      'and refuses to write them to disk in plaintext. Enable a system keychain and retry.',
    { exitCode: 78 },
  )
}

/**
 * @param {string} profile
 * @returns {Promise<string | null>}
 */
export async function getToken(profile) {
  if (!Entry) return null
  const account = `${profile}/token`
  try {
    return getEntry(account).getPassword() || null
  } catch (err) {
    debug('getToken error: %s', err.message)
    return null
  }
}

/**
 * @param {string} profile
 * @param {string} token
 */
export async function setToken(profile, token) {
  if (!Entry) keychainRequired()
  const account = `${profile}/token`
  getEntry(account).setPassword(token)
}

/** @param {string} profile */
export async function deleteToken(profile) {
  if (!Entry) return
  const account = `${profile}/token`
  try {
    getEntry(account).deletePassword()
  } catch (err) {
    debug('deleteToken error: %s', err.message)
  }
}

export function isKeychainAvailable() {
  return Entry !== null
}
