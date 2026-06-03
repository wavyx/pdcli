import { describe, it, expect, afterEach } from 'vitest'
import {
  getToken,
  setToken,
  deleteToken,
  isKeychainAvailable,
} from '../../src/lib/keychain.js'

const testProfile = `pdcli-test-${Date.now()}`
const sampleToken = 'test-api-token-0123456789abcdef0123456789abcdef'

// The real-keyring round-trip needs an OS keychain; skip where unavailable
// (e.g. Linux CI without libsecret). The fallback behavior is covered by
// keychain-fallback.test.js, which mocks the native module.
describe.skipIf(!isKeychainAvailable())('keychain (real keyring)', () => {
  afterEach(async () => {
    await deleteToken(testProfile)
  })

  describe('setToken + getToken round-trip', () => {
    it('stores and retrieves the token', async () => {
      await setToken(testProfile, sampleToken)
      const result = await getToken(testProfile)
      expect(result).toBe(sampleToken)
    })
  })

  describe('deleteToken', () => {
    it('removes the stored token so getToken returns null', async () => {
      await setToken(testProfile, sampleToken)
      expect(await getToken(testProfile)).toBe(sampleToken)

      await deleteToken(testProfile)
      expect(await getToken(testProfile)).toBeNull()
    })

    it('does not throw when deleting a non-existent profile', async () => {
      await expect(
        deleteToken(`nonexistent-profile-${Date.now()}`),
      ).resolves.toBeUndefined()
    })
  })

  describe('getToken', () => {
    it('returns null for a non-existent profile', async () => {
      const result = await getToken(`no-such-profile-${Date.now()}`)
      expect(result).toBeNull()
    })
  })

  describe('lifecycle', () => {
    it('returns null after the token is deleted, repeat delete is a no-op', async () => {
      const lifecycleProfile = `lifecycle-test-${Date.now()}`
      await setToken(lifecycleProfile, 'lifecycle-token')
      expect(await getToken(lifecycleProfile)).toBe('lifecycle-token')

      await deleteToken(lifecycleProfile)
      expect(await getToken(lifecycleProfile)).toBeNull()
      await expect(deleteToken(lifecycleProfile)).resolves.toBeUndefined()
    })
  })
})

describe('isKeychainAvailable', () => {
  it('returns a boolean', () => {
    expect(typeof isKeychainAvailable()).toBe('boolean')
  })
})
