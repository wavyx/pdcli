# Contributing to pdcli

Thanks for your interest in improving `pdcli`! This guide covers how to set up
the project, the workflow we follow, and how to get a change merged and released.

`pdcli` is JavaScript ESM on [oclif](https://oclif.io/) — no TypeScript, JSDoc
types where they help. Not affiliated with or endorsed by Pipedrive.

## Development setup

You need **Node.js 20+** (the LTS line we target and test against).

```bash
git clone https://github.com/wavyx/pdcli.git
cd pdcli
npm install
```

Run the CLI straight from source with the dev launcher — no build, no global
install — so your edits take effect immediately:

```bash
./bin/dev.js --help
./bin/dev.js deal list --status open
```

`bin/dev.js` loads a local `.env` (see `.env.example`) so you can point at a
sandbox with `PDCLI_COMPANY_DOMAIN` / `PDCLI_API_TOKEN` without touching your
keychain. `bin/run.js` is the published entrypoint and runs the built command tree.

## Test-driven development (required)

Every change follows **red → green → refactor**:

1. **Red** — write a failing test first, and run it to watch it fail _for the
   right reason_.
2. **Green** — write the minimal code to make it pass.
3. **Refactor** — clean up with the tests still green.

No production code lands without a failing test that motivated it. We use
[Vitest](https://vitest.dev/) with [nock](https://github.com/nock/nock) for
HTTP, mirroring the patterns in `test/`.

```bash
npm test                 # full suite
npm run test:watch       # watch mode while you work
npm run test:coverage    # suite + coverage report
```

Run a **single test file** while iterating:

```bash
npx vitest run test/commands/deal/list.test.js
```

### Coverage

Coverage thresholds are enforced at **100%** (statements, branches, functions,
lines). Aim for 100% on any file you touch — exercise the error paths and
branches, not just the happy path.

## Lint before every commit

CI runs the exact same lint command, so run it locally first to avoid a red run:

```bash
npm run lint        # eslint . && prettier --check .
npm run lint:fix    # autofix what can be fixed
```

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/), scoped when
it helps:

```
feat(deal): add bulk-update --owner flag
fix(client): honor Retry-After on 429
docs: document the api escape hatch
test(person): cover CSV import conflict path
chore: bump undici
```

Common types: `feat`, `fix`, `docs`, `test`, `chore`, `style`, `ci`.

## Generated files — don't hand-edit

Some files are produced by scripts; edit the generator, not the output:

- `docs/commands.md` and the website command reference — `npm run docs:commands`
  (run after `npm run build`, which writes the oclif manifest).
- `docs/demo.svg` (the animated README terminal) — `npm run docs:demo`.

`oclif.manifest.json` is generated and git-ignored; never commit it.

## Scratch docs are not committed

`CLAUDE.md`, `pdcli-spec.md`, `pipedrive-api-notes.md`, the `design/` directory,
and screenshots (`*.png`) are local scratch / handoff context. They are
git-ignored and must not be committed. **Stage explicit paths** — never
`git add -A` or `git add .`.

## Opening a pull request

1. Branch off `main`.
2. Make sure `npm run lint` and `npm run test:coverage` both pass.
3. Open a PR against `main`. CI lints once and runs the test matrix across
   Node 20/22/24 on Linux, macOS, and Windows.

## Release flow

Releases are tag-driven and fully automated — maintainers only:

1. Update `CHANGELOG.md` and bump the version in `package.json`.
2. Tag the release: `git tag vX.Y.Z && git push --tags`.
3. The `Release` workflow (triggered by the `v*` tag) re-runs lint and coverage,
   then publishes to npm via OIDC **trusted publishing** with provenance (no
   `NPM_TOKEN`), packs native tarballs, and creates the GitHub Release from the
   matching `CHANGELOG.md` section.

## Docs

Project docs live at **<https://wavyx.github.io/pdcli>** (guides, cookbook,
AI-agent quickstart, command reference). The site source is under `website/`.

## Security

Please **do not** put secrets — API tokens, OAuth credentials, company domains
you'd rather not share — in issues, PRs, or test fixtures. To report a security
vulnerability, contact the maintainers privately rather than opening a public
issue.
