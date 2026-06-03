import { describe, it, expect, afterEach } from 'vitest'
import {
  getConf,
  getActiveProfile,
  setActiveProfile,
  loadConfig,
  setProfileConfig,
  getProfileConfig,
  getAllProfiles,
  getProfileData,
  deleteProfileConfig,
} from '../../src/lib/config.js'

describe('config', () => {
  afterEach(() => {
    // Clean up any test profiles we created
    const conf = getConf()
    conf.set('activeProfile', 'default')
    conf.delete('profiles.test-profile')
    conf.delete('profiles.alpha')
    conf.delete('profiles.beta')
  })

  describe('getConf', () => {
    it('returns a Conf instance with expected methods', () => {
      const conf = getConf()
      expect(conf).toBeDefined()
      expect(typeof conf.get).toBe('function')
      expect(typeof conf.set).toBe('function')
      expect(typeof conf.delete).toBe('function')
    })

    it('returns the same instance on repeated calls', () => {
      const a = getConf()
      const b = getConf()
      expect(a).toBe(b)
    })
  })

  describe('getActiveProfile / setActiveProfile', () => {
    it('returns "default" initially', () => {
      expect(getActiveProfile()).toBe('default')
    })

    it('changes active profile with setActiveProfile', () => {
      setActiveProfile('test-profile')
      expect(getActiveProfile()).toBe('test-profile')
    })
  })

  describe('loadConfig', () => {
    it('returns activeProfile in the result', () => {
      const cfg = loadConfig()
      expect(cfg).toHaveProperty('activeProfile')
      expect(cfg.activeProfile).toBe(getActiveProfile())
    })

    it('uses profileFlag when provided', () => {
      const cfg = loadConfig('test-profile')
      expect(cfg.activeProfile).toBe('test-profile')
    })

    it('includes profile data in the returned object', () => {
      setProfileConfig('test-profile', 'company_domain', 'acme')
      const cfg = loadConfig('test-profile')
      expect(cfg.activeProfile).toBe('test-profile')
      expect(cfg.company_domain).toBe('acme')
    })
  })

  describe('setProfileConfig / getProfileConfig', () => {
    it('round-trips a string value correctly', () => {
      setProfileConfig('test-profile', 'company_domain', 'acme')
      expect(getProfileConfig('test-profile', 'company_domain')).toBe('acme')
    })

    it('round-trips a numeric value correctly', () => {
      setProfileConfig('test-profile', 'timeout_ms', 5000)
      expect(getProfileConfig('test-profile', 'timeout_ms')).toBe(5000)
    })

    it('returns undefined for a key that does not exist', () => {
      expect(getProfileConfig('test-profile', 'nonexistent')).toBeUndefined()
    })
  })

  describe('getProfileData', () => {
    it('returns all data for a profile', () => {
      setProfileConfig('test-profile', 'company_domain', 'acme')
      setProfileConfig('test-profile', 'default_output', 'json')
      const data = getProfileData('test-profile')
      expect(data).toEqual({
        company_domain: 'acme',
        default_output: 'json',
      })
    })

    it('returns empty object for a profile that does not exist', () => {
      expect(getProfileData('nonexistent-profile')).toEqual({})
    })
  })

  describe('getAllProfiles', () => {
    it('returns an object containing all profiles', () => {
      setProfileConfig('alpha', 'company_domain', 'a')
      setProfileConfig('beta', 'company_domain', 'b')
      const profiles = getAllProfiles()
      expect(profiles).toHaveProperty('alpha')
      expect(profiles).toHaveProperty('beta')
      expect(profiles.alpha.company_domain).toBe('a')
      expect(profiles.beta.company_domain).toBe('b')
    })
  })

  describe('deleteProfileConfig', () => {
    it('removes a specific key from a profile', () => {
      setProfileConfig('test-profile', 'toRemove', 'value')
      expect(getProfileConfig('test-profile', 'toRemove')).toBe('value')
      deleteProfileConfig('test-profile', 'toRemove')
      expect(getProfileConfig('test-profile', 'toRemove')).toBeUndefined()
    })
  })
})
