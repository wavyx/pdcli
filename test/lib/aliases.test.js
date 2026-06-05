import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = {}
const mockConf = {
  get: vi.fn((key) => {
    if (key === 'aliases') return store.aliases
    return undefined
  }),
  set: vi.fn((key, value) => {
    if (key.startsWith('aliases.')) {
      const name = key.slice('aliases.'.length)
      store.aliases = { ...(store.aliases ?? {}), [name]: value }
    }
  }),
  delete: vi.fn((key) => {
    if (key.startsWith('aliases.')) {
      const name = key.slice('aliases.'.length)
      if (store.aliases) delete store.aliases[name]
    }
  }),
}

vi.mock('../../src/lib/config.js', () => ({
  getConf: vi.fn(() => mockConf),
}))

const { getAliases, getAlias, setAlias, unsetAlias } =
  await import('../../src/lib/aliases.js')

describe('aliases', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
    mockConf.get.mockClear()
    mockConf.set.mockClear()
    mockConf.delete.mockClear()
  })

  describe('getAliases', () => {
    it('returns empty object when no aliases configured', () => {
      expect(getAliases()).toEqual({})
    })

    it('returns the aliases object from conf', () => {
      store.aliases = { wd: 'deal list', won: 'deal list --status won' }
      expect(getAliases()).toEqual({
        wd: 'deal list',
        won: 'deal list --status won',
      })
    })
  })

  describe('getAlias', () => {
    it('returns undefined for missing alias', () => {
      expect(getAlias('nope')).toBeUndefined()
    })

    it('returns the command string for an existing alias', () => {
      store.aliases = { wd: 'deal list --status won' }
      expect(getAlias('wd')).toBe('deal list --status won')
    })
  })

  describe('setAlias', () => {
    it('writes alias to conf at aliases.<name>', () => {
      setAlias('wd', 'deal list')
      expect(mockConf.set).toHaveBeenCalledWith('aliases.wd', 'deal list')
    })

    it('round-trips with getAlias', () => {
      setAlias('wd', 'deal list --limit 5')
      expect(getAlias('wd')).toBe('deal list --limit 5')
    })
  })

  describe('unsetAlias', () => {
    it('deletes alias from conf at aliases.<name>', () => {
      unsetAlias('wd')
      expect(mockConf.delete).toHaveBeenCalledWith('aliases.wd')
    })

    it('removes an existing alias so getAlias returns undefined', () => {
      setAlias('wd', 'deal list')
      expect(getAlias('wd')).toBe('deal list')
      unsetAlias('wd')
      expect(getAlias('wd')).toBeUndefined()
    })
  })
})
