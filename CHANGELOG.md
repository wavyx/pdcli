# Changelog

All notable changes to `pdcli` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

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
- Global `search` (itemSearch).
- Host-locked raw escape hatch: `pdcli api <METHOD> <path>` (v1 + v2).
- `doctor` diagnostics and `version`.
- Dual-API client: token-budget-aware 429 backoff, 429→403 hard stop,
  `--no-retry`, `--timeout`; deterministic sysexits exit codes.
- Output: table (TTY) and JSON (piped) via `--output`.
