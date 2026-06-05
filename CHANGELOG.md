# Changelog

All notable changes to `pdcli` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

## [0.7.0] - 2026-06-05

### Added

- `default_output` profile config key is now honored: set
  `pdcli config set default_output json` and every command (including
  error output) defaults to that format when no `--output` flag is given.
  An explicit flag still wins; invalid stored values fall back to the
  table-in-TTY / JSON-when-piped default.
- Docs website redesigned with the "Clarity" design system: new landing
  page (animated terminal, quickstart, feature grid, live CLI stats),
  light-first theme with dark mode, custom header/footer, social cards,
  and brand fonts (Plus Jakarta Sans + JetBrains Mono) across all pages.
- Homepage stats (version, command/topic/format counts) are generated
  from the CLI manifest at docs-build time so they can never drift.

### Fixed

- Command-reference, config, and exit-code tables on the docs site
  rendered as raw pipe characters; all GFM tables now render properly.
- Documentation corrected against the implementation: autocomplete
  shells, exit-code 64 semantics, JSON error-output trigger, rate-limit
  header behavior, `--company`/`--api-token` flag scoping, and the
  audit `--verbose` example.
- Accessibility on the docs site: theme-toggle labeling, decorative
  terminal/SVG content hidden from screen readers, heading hierarchy,
  and WCAG AA contrast for footer and small-text elements.

## [0.6.0] - 2026-06-04

### Added

- Documentation site (Astro + Starlight) at wavyx.github.io/pdcli:
  quickstarts (including a dedicated AI-agent quickstart), guides for every
  feature area, automation recipes, concepts, and a command reference
  generated from the CLI manifest.
- Machine-readable docs for AI agents: `llms.txt`, `llms-full.txt`, and
  `llms-small.txt`.
- Native tarballs (linux x64/arm64, macOS x64/arm64, Windows x64) attached
  to every GitHub Release for non-npm installs.
- Shell completion docs (`pdcli autocomplete bash|zsh|powershell`).
- `bin/dev.js` development runner (no manifest cache).

## [0.5.0] - 2026-06-04

### Added

- `metrics velocity` — the Sales Velocity Equation ((open × win rate ×
  avg won value) / cycle days) with all four levers, over a trailing
  `--period` and optional `--pipeline`/`--owner` scope.
- `funnel` — stage-to-stage conversion approximated from closed deals'
  final stages, plus the current open distribution per stage.
- `pipeline health` — per-stage snapshot: open count/value,
  probability-weighted value, stale deals (>14d), deals without a next
  step, deals past their close date.
- `audit` — 11 data-hygiene checks (stale/ancient deals, missing fields,
  duplicate persons by email, duplicate orgs by name, uncontactable
  contacts, overdue pileups, …) with `--checks`, `--verbose`, and
  `--strict` (exit 1 on must-severity findings — CI-able).

## [0.4.0] - 2026-06-04

### Added

- `deal bulk-update` — update many deals at once by `--ids`, a Pipedrive
  saved `--filter`, or ids piped on stdin. Paced sequentially inside the
  rate-limit burst window, confirms before writing (`--yes` to skip),
  `--dry-run` previews targets, partial failures are listed per deal and
  exit 1.
- `person import` / `org import` — bulk-create from CSV. Headers map to
  fields, including custom fields by human name with option-label
  resolution; `--dry-run` validates every row without writing.

### Changed

- CI actions bumped to checkout/setup-node v5.

## [0.3.0] - 2026-06-04

### Added

- Full entity surface: `lead` (v1, UUID ids), `note`, `file`
  (list/get/download/upload), `filter`, `webhook` (defaults to v2 payloads),
  `goal`, `pipeline`/`stage`, and `project` (v2) topics.
- Output formats everywhere: `--output yaml|csv` join `table|json`; `--jq`
  expression filtering (lazy-loaded native jq); `--fields` column selection.
- `pdcli backup` — full-account export to a JSON tree (18 resources), with a
  manifest checkpoint after every resource and `--resume` to continue
  interrupted runs.
- Client: binary downloads and multipart uploads (files API), host-locked
  like every other request.

## [0.2.0] - 2026-06-04

### Added

- Write paths for core CRM: `deal|person|org|activity create/update/delete`
  (v2 PATCH semantics — only provided fields change). Destructive deletes
  prompt unless `--yes`.
- Custom-field input resolution: repeatable `--field "Name=Value"` resolves
  human field names to hash keys and option labels to IDs (enum, set, and
  numeric coercion); `--body` accepts raw JSON (typed flags win).
- `product` topic: `list/get/create/update/delete` with `--price`/`--currency`
  pairs.
- OAuth 2.0: `auth login --oauth` (browser authorization-code flow against
  your own Developer Hub app). Access/refresh tokens, `api_domain`, and the
  client secret are stored only in the OS keychain; access tokens refresh
  automatically on expiry and on 401. `auth status` shows mode and expiry;
  `auth logout` clears both auth modes.
- `activity create/update --person` maps to a primary participant
  (`person_id` is read-only on v2 activity writes).

## [0.1.0] - 2026-06-03

### Added

- Token-first authentication (`auth login/status/logout`) — API token stored
  only in the OS keychain; company domain in per-profile config.
- Profiles (`profile list/use/current`) and per-profile config
  (`config get/set/list`).
- Core CRM reads on API v2: `deal|person|org|activity list/get` with cursor
  pagination and `--limit`.
- Custom-field discovery and resolution: `field list/get` plus automatic
  name/label resolution in table output.
- Global `search` (itemSearch) and `user me` (v1 users endpoint).
- Host-locked raw escape hatch: `pdcli api <METHOD> <path>` (v1 + v2).
- `doctor` diagnostics and `version`.
- Dual-API client: token-budget-aware 429 backoff, 429→403 hard stop,
  `--no-retry`, `--timeout`; deterministic sysexits exit codes.
- Output: table (TTY) and JSON (piped) via `--output`.
