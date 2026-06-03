import { describe, it, expect, vi } from 'vitest'

// Simulate an environment where the native OS keyring is unavailable
// (e.g. Linux without libsecret). pdcli must refuse to store credentials
// rather than silently fall back to a plaintext file.
vi.mock('@napi-rs/keyring', () => {
  throw new Error('Native module not available')
})

const { getToken, setToken, deleteToken, isKeychainAvailable } =
  await import('../../src/lib/keychain.js')

const testProfile = `pdcli-nokeychain-${Date.now()}`

describe('keychain when OS keychain is unavailable', () => {
  it('isKeychainAvailable returns false', () => {
    expect(isKeychainAvailable()).toBe(false)
  })

  it('setToken throws a clear keychain-unavailable error (never writes plaintext)', async () => {
    await expect(setToken(testProfile, 'some-token')).rejects.toThrow(
      /keychain/i,
    )
  })

  it('getToken returns null instead of crashing', async () => {
    await expect(getToken(testProfile)).resolves.toBeNull()
  })

  it('deleteToken is a no-op that does not throw', async () => {
    await expect(deleteToken(testProfile)).resolves.toBeUndefined()
  })
})
