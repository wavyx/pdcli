# Changelog

All notable changes to `pdcli` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

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
