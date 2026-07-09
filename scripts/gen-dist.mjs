// Regenerate the Homebrew formula + Scoop manifest for a published version.
//
//   node scripts/gen-dist.mjs <version>
//
// Writes packaging/homebrew/pdcli.rb and packaging/scoop/pdcli.json (both
// git-ignored — they live in the wavyx/homebrew-tap and wavyx/scoop-pdcli
// repos). See packaging/README.md. Run AFTER the version is on npm.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const PKG = '@wavyx/pdcli'

/** Render the Homebrew formula (standard node-CLI pattern). */
export function renderHomebrewFormula({ url, sha256 }) {
  return `class Pdcli < Formula
  desc "Command-line interface for Pipedrive"
  homepage "https://github.com/wavyx/pdcli"
  url "${url}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "jq"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    # pdcli's --jq flag uses node-jq, which normally downloads its own jq binary
    # via a postinstall script. std_npm_args passes --ignore-scripts and the
    # Homebrew build sandbox blocks network, so point node-jq at the Homebrew jq
    # instead (node-jq honors $JQ_PATH at runtime).
    (bin/"pdcli").write_env_script libexec/"bin/pdcli",
                                   JQ_PATH: formula_opt_bin("jq")/"jq"
  end

  test do
    assert_match "pdcli", shell_output("#{bin}/pdcli version")
    # Exercise --jq so the node-jq / Homebrew-jq wiring can't silently regress.
    system bin/"pdcli", "config", "list", "--output", "json", "--jq", "."
  end
end
`
}

/** Render the Scoop manifest (installs via npm; needs Node). */
export function renderScoopManifest({ version }) {
  return (
    JSON.stringify(
      {
        version,
        description: 'Command-line interface for Pipedrive',
        homepage: 'https://github.com/wavyx/pdcli',
        license: 'MIT',
        depends: 'nodejs',
        installer: { script: [`npm install -g ${PKG}@${version}`] },
        uninstaller: { script: [`npm uninstall -g ${PKG}`] },
        checkver: {
          url: `https://registry.npmjs.org/${PKG}`,
          jsonpath: "$.['dist-tags'].latest",
        },
        // Templated with Scoop's $version placeholder so autoupdate rewrites the
        // pinned version inside installer.script too — not just top-level version.
        // Without this, autoupdate bumps `version` while the install command stays
        // pinned to the previous release.
        autoupdate: {
          installer: { script: [`npm install -g ${PKG}@$version`] },
        },
      },
      null,
      2,
    ) + '\n'
  )
}

/** Fetch the npm tarball URL + its sha256 for a version. */
export async function fetchDist(version, fetchFn = fetch) {
  const meta = await fetchFn(
    `https://registry.npmjs.org/${PKG}/${version}`,
  ).then((r) => r.json())
  const url = meta.dist.tarball
  const buf = Buffer.from(await fetchFn(url).then((r) => r.arrayBuffer()))
  const sha256 = createHash('sha256').update(buf).digest('hex')
  return { version, url, sha256 }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2]
  if (!version) {
    console.error('usage: node scripts/gen-dist.mjs <version>')
    process.exit(1)
  }
  const dist = await fetchDist(version)
  mkdirSync(new URL('../packaging/homebrew/', import.meta.url), {
    recursive: true,
  })
  mkdirSync(new URL('../packaging/scoop/', import.meta.url), {
    recursive: true,
  })
  writeFileSync(
    new URL('../packaging/homebrew/pdcli.rb', import.meta.url),
    renderHomebrewFormula(dist),
  )
  writeFileSync(
    new URL('../packaging/scoop/pdcli.json', import.meta.url),
    renderScoopManifest(dist),
  )
  console.log(
    `Wrote packaging/homebrew/pdcli.rb + packaging/scoop/pdcli.json for ${version} (sha256 ${dist.sha256})`,
  )
}
