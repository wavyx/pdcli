# Packaging

pdcli ships through several channels. npm is the source of truth; the others
are generated from the published tarball.

| Channel  | Install                                                                              | Source                         |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| npm      | `npm install -g @wavyx/pdcli`                                                        | this repo (`npm publish`)      |
| Docker   | `docker run --rm ghcr.io/wavyx/pdcli --help`                                         | `Dockerfile` (release.yml)     |
| Homebrew | `brew tap wavyx/tap && brew install pdcli`                                           | `wavyx/homebrew-tap` (formula) |
| Scoop    | `scoop bucket add pdcli https://github.com/wavyx/scoop-pdcli && scoop install pdcli` | `wavyx/scoop-pdcli` (manifest) |

## Updating Homebrew + Scoop on release

After a version is published to npm:

```bash
node scripts/gen-dist.mjs <version>     # e.g. 0.19.0
```

This downloads the npm tarball, computes its sha256, and writes:

- `packaging/homebrew/pdcli.rb` → commit to `wavyx/homebrew-tap` as `Formula/pdcli.rb`
- `packaging/scoop/pdcli.json` → commit to `wavyx/scoop-pdcli` as `bucket/pdcli.json`

Both generated files are git-ignored here — they live in their own repos.

## Automation

The `dist` job in `.github/workflows/release.yml` regenerates both files from the
just-published tarball and pushes them to the tap repos on every stable release —
**as long as a `TAP_TOKEN` secret exists**. It must be a fine-grained PAT with
`contents:write` on `wavyx/homebrew-tap` and `wavyx/scoop-pdcli`. Without the
secret the job no-ops (the release never fails), and you publish with the manual
`node scripts/gen-dist.mjs <version>` step above. npm publish and the Docker image
are always automated.

## Container security caveat (env-var tokens)

The container has no OS keychain, so `pdcli` in Docker authenticates from
environment variables — `PDCLI_API_TOKEN` and `PDCLI_COMPANY_DOMAIN`:

```bash
docker run --rm -e PDCLI_API_TOKEN -e PDCLI_COMPANY_DOMAIN \
  ghcr.io/wavyx/pdcli deal list --output json
```

Env-var tokens are **plaintext** — that is fine for an ephemeral CI runner that
holds the secret only for the job, but on a desktop the OS keychain is the whole
point of pdcli's security posture, so prefer the npm/Homebrew/Scoop installs and
`pdcli auth login` there. Two rules regardless of host:

- **Never bake a token into an image layer** (no `ENV PDCLI_API_TOKEN=…`, no
  `--build-arg` secrets). Layers are cached and shippable; the token would leak
  to anyone who pulls the image. Pass it at runtime with `-e` / `--env-file`.
- Scope the token to what the job needs and rotate it like any other CI secret.
