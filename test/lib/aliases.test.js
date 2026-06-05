import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = {}
// Mimic conf's real dotted-path semantics: `set('aliases.x', v)` writes a
// NESTED key, splitting on '.', so a name that itself contains a dot would
// be stored at the wrong depth and never round-trip via `get('aliases')[name]`.
// A plain `set('aliases', obj)` replaces the whole object.
function setPath(obj, path, value) {
  const parts = path.split('.')
  let node = obj
  for (let i = 0; i < parts.length - 1; i++) {
    node[parts[i]] ??= {}
    node = node[parts[i]]
  }
  node[parts[parts.length - 1]] = value
}
const mockConf = {
  get: vi.fn((key) => {
    if (key === 'aliases') return store.aliases
    return undefined
  }),
  set: vi.fn((key, value) => {
    if (key === 'aliases') {
      store.aliases = value
      return
    }
    if (key.startsWith('aliases.')) {
      store.aliases ??= {}
      setPath(store.aliases, key.slice('aliases.'.length), value)
    }
  }),
  delete: vi.fn((key) => {
    if (key === 'aliases') {
      delete store.aliases
      return
    }
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
    it('writes the whole aliases object (non-dotted path)', () => {
      setAlias('wd', 'deal list')
      expect(mockConf.set).toHaveBeenCalledWith('aliases', { wd: 'deal list' })
      // It must NOT use a dotted path key.
      const dottedCall = mockConf.set.mock.calls.find((c) =>
        c[0].startsWith('aliases.'),
      )
      expect(dottedCall).toBeUndefined()
    })

    it('merges with existing aliases rather than clobbering them', () => {
      store.aliases = { won: 'deal list --status won' }
      setAlias('wd', 'deal list')
      expect(getAliases()).toEqual({
        won: 'deal list --status won',
        wd: 'deal list',
      })
    })

    it('round-trips with getAlias', () => {
      setAlias('wd', 'deal list --limit 5')
      expect(getAlias('wd')).toBe('deal list --limit 5')
    })

    it('round-trips a name containing a dot as a flat key', () => {
      setAlias('my.alias', 'deal list')
      expect(getAlias('my.alias')).toBe('deal list')
      expect(getAliases()).toEqual({ 'my.alias': 'deal list' })
    })
  })

  describe('unsetAlias', () => {
    it('writes the whole aliases object without the removed key (non-dotted path)', () => {
      store.aliases = { wd: 'deal list', won: 'deal list --status won' }
      unsetAlias('wd')
      expect(mockConf.set).toHaveBeenCalledWith('aliases', {
        won: 'deal list --status won',
      })
      const dottedCall = mockConf.set.mock.calls.find((c) =>
        c[0].startsWith('aliases.'),
      )
      expect(dottedCall).toBeUndefined()
    })

    it('removes an existing alias so getAlias returns undefined', () => {
      setAlias('wd', 'deal list')
      expect(getAlias('wd')).toBe('deal list')
      unsetAlias('wd')
      expect(getAlias('wd')).toBeUndefined()
    })

    it('removes a name containing a dot', () => {
      setAlias('my.alias', 'deal list')
      expect(getAlias('my.alias')).toBe('deal list')
      unsetAlias('my.alias')
      expect(getAlias('my.alias')).toBeUndefined()
    })
  })
})
