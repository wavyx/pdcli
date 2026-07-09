import { describe, it, expect } from 'vitest'
import { renderScoopManifest } from '../scripts/gen-dist.mjs'

describe('renderScoopManifest', () => {
  it('pins the concrete version in the active installer.script', () => {
    const manifest = JSON.parse(renderScoopManifest({ version: '0.20.0' }))
    expect(manifest.version).toBe('0.20.0')
    expect(manifest.installer.script).toEqual([
      'npm install -g @wavyx/pdcli@0.20.0',
    ])
  })

  it('templates autoupdate.installer.script with the $version placeholder so autoupdate rewrites the pinned install version, not just url/hash', () => {
    const manifest = JSON.parse(renderScoopManifest({ version: '0.20.0' }))
    expect(manifest.autoupdate.installer.script).toEqual([
      'npm install -g @wavyx/pdcli@$version',
    ])
  })
})
