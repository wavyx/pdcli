import { describe, it, expect, afterEach } from 'vitest'
import {
  getToken,
  setToken,
  deleteToken,
  getOAuthTokens,
  setOAuthTokens,
  deleteOAuthTokens,
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

const sampleOAuth = {
  accessToken: 'at-123',
  refreshToken: 'rt-456',
  expiresAt: 1750000000000,
  apiDomain: 'https://acme.pipedrive.com',
  clientId: 'cid',
  clientSecret: 'csec',
}

describe.skipIf(!isKeychainAvailable())(
  'keychain OAuth slot (real keyring)',
  () => {
    const oauthProfile = `pdcli-oauth-test-${Date.now()}`

    afterEach(async () => {
      await deleteOAuthTokens(oauthProfile)
    })

    it('round-trips the OAuth token bundle as JSON', async () => {
      await setOAuthTokens(oauthProfile, sampleOAuth)
      expect(await getOAuthTokens(oauthProfile)).toEqual(sampleOAuth)
    })

    it('returns null for a profile without OAuth tokens', async () => {
      expect(await getOAuthTokens(`none-${Date.now()}`)).toBeNull()
    })

    it('returns null for corrupted stored JSON', async () => {
      const { Entry } = await import('@napi-rs/keyring')
      const entry = new Entry('pdcli', `${oauthProfile}/oauth`)
      entry.setPassword('not-json{{{')
      expect(await getOAuthTokens(oauthProfile)).toBeNull()
      entry.deletePassword()
    })

    it('deleteOAuthTokens removes the bundle and tolerates repeats', async () => {
      await setOAuthTokens(oauthProfile, sampleOAuth)
      await deleteOAuthTokens(oauthProfile)
      expect(await getOAuthTokens(oauthProfile)).toBeNull()
      await expect(deleteOAuthTokens(oauthProfile)).resolves.toBeUndefined()
    })
  },
)
