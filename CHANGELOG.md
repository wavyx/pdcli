# Changelog

All notable changes to `pdcli` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

## [0.21.0] - 2026-07-09

Dev loop: check your rate budget, resolve records to ids, and point pdcli at a
local mock.

### Added

- **`pdcli quota` (alias `ratelimit`)** — reads Pipedrive's daily token-budget
  headers via one cheap request and prints remaining/limit/percent. `--min <n>`
  and `--threshold <pct>` gate CI (exit 75 when too low) so a batch can check
  headroom first: `pdcli quota --min 5000 && pdcli sync warehouse`. The budget is
  company-wide, so treat the number as a hint. An exhausted budget still prints
  the reading instead of erroring out.
- **`pdcli lookup <entity> --field <name> --value <v>`** — exact-match id lookup
  (deal, person, org, product, lead) via the field-search endpoint, resolving a
  human field name to its custom-field key. `--first` returns one row for shell
  composition (`--first --jq .id`); **no match exits 3** so a script can branch
  create-vs-update. Matching is case-sensitive and the search index is eventually
  consistent.
- **Localhost mock endpoint** — set `PDCLI_BASE_URL` to a `localhost`/`127.0.0.1`
  address (e.g. a Prism mock of the OpenAPI spec) to run pdcli against it. Any
  non-localhost value is refused (exit 78), the real keychain/OAuth token is
  never sent to the override host (a `PDCLI_API_TOKEN` is required), and a loud
  banner prints to stderr.

## [0.20.0] - 2026-07-09

Distribution: install pdcli however your pipeline prefers, and drive the
host-locked passthrough across every page.

### Added

- **`pdcli api --paginate` (alias `--all`)** — the raw passthrough now follows
  Pipedrive pagination itself and prints one concatenated array. GET only; the
  pager is inferred from the `/api/v1/` (offset) or `/api/v2/` (cursor) path; any
  querystring on the path (including repeated keys) seeds the first page;
  `--limit` caps total items and stops fetching early. With `--paginate`, `--jq`
  sees the bare item array (`.[]`) rather than the response envelope (`.data[]`).
- **Docker images** on GHCR: `docker run --rm -e PDCLI_API_TOKEN -e PDCLI_COMPANY_DOMAIN ghcr.io/wavyx/pdcli deal list --output json` (multi-arch amd64+arm64, built after each npm publish).
- **Homebrew** (`brew install wavyx/tap/pdcli`) and **Scoop** packaging generated per release, plus documented standalone tarballs and a GitHub Actions recipe.

### Changed

- **`--jq` can no longer hang.** If the jq binary is missing (npm >= 11 skips
  node-jq's install step), `--jq` now fails fast with a clear "jq unavailable"
  error (exit 69) instead of hanging forever. A genuinely invalid jq filter still
  surfaces jq's own syntax error.
- **`--limit` must be >= 1** (usage error 64) instead of silently treating `0`
  as "all pages".

## [0.19.0] - 2026-07-09

Agent surface: pdcli becomes an MCP server, and `doctor` grows a
machine-readable CI-preflight contract.

### Added

- **`pdcli mcp serve` — Model Context Protocol server over stdio.** The tool
  catalog is derived from the CLI's own command manifest, so every tool stays
  in lockstep with the CLI. Defaults to a curated set of 45 read-only tools
  (core entity reads, search, deal context/history/summary, all metrics,
  funnel, digest, audit, rep scorecard); `--allow-writes` adds 14 core write
  tools (create/update on core entities plus the idempotent upserts);
  `--topics <csv>` and `--all-tools` widen the scope. Every command's
  read/write/destructive classification is pinned by an audited test over all
  146 commands — unknown future verbs default to gated writes. Tool calls run
  pdcli as a child process forcing `--output=json`, `--yes`, and
  `--resolve-fields` (agents see custom-field names, not hash keys), with a
  120s timeout and 16 MB output cap. Never exposed: `api`, `auth *`,
  `doctor`, `watch`, `changes`, `sync warehouse`, `backup` (`backup diff`
  stays — it reads local snapshots only).
- **`doctor --offline`** — skips the API probe; five local checks, zero
  network egress. The CI preflight mode.
- `doctor` env-token mode: with `PDCLI_API_TOKEN` set, the token check passes
  with `source: env` and a missing OS keychain is no longer a failure
  (containers/CI don't have one).

### Changed

- **BREAKING: `doctor` now exits 78 when any check fails** (previously always
  exit 0). Scripts can finally gate on it; scripts that assumed 0 must adapt.
- **`doctor` honors `--output`**: `json`/`yaml`/`csv` (or piped output) emit
  machine rows `[{check, status, detail?}]` on stdout with the standard JSON
  error envelope on stderr; the human table renders only interactively. The
  old stdout summary line ("N checks failed") moved into the standard error
  path.

## [0.18.0] - 2026-06-14

Second contract-hardening pass from a full quality audit, closing the
exit-code, machine-output, and data-safety gaps that a 1.0 freeze would lock
in. Most items are bug fixes; the BREAKING notes are exit-code/output changes a
script could observe.

### Fixed — data safety (the headline)

- **CSV `--upsert` no longer deletes a matched record's other emails/phones.**
  The match (identity) field is now excluded from the update diff, so matching
  a person by one email never PATCHes their email list down to that single
  value. Same for phones.
- **Upsert matching on a monetary/address custom field is refused (exit 64)**
  instead of silently never matching and creating a duplicate on every run
  (v2 returns those fields as objects the scalar compare can't match).
- **Excel "CSV UTF-8" imports work**: a leading UTF-8 BOM is stripped instead
  of corrupting the first column name into a "missing name column" error.
- A non-integer `org_id`/`owner_id` CSV cell is rejected (exit 65) instead of
  serializing as `null` and silently unlinking the relation; a non-numeric
  value for a numeric custom field is likewise rejected.
- **`changes --limit` no longer silently skips rows** sharing the cut row's
  update-time second; they replay next run (it warns, never silently loses,
  when a single second exceeds the limit).
- **`--output csv` no longer emits a silently-blank header+rows** when a command
  has no preset columns — it derives columns from the data (so `changes
--output csv` can't advance its watermark over never-written rows).

### Security

- The HTTP transport no longer follows redirects (`redirect: 'manual'`) and
  refuses any 3xx (exit 78), so the API token is never re-sent to a redirect
  target off your host-locked company domain.

### Changed

- **BREAKING — exit codes corrected to the ladder.** Network unreachable / DNS
  failure / `--timeout` now exit **69** (was 70); exhausted 429 retries exit
  **75** (was 69); a failed/rejected `deal`/`lead convert` exits **65** (was
  70); a failed OAuth refresh (`invalid_grant`) exits **77** (was 65);
  malformed `pdcli api --body` JSON exits **65** (was 70). Exit **70** is now
  truly internal-bug-only.
- **BREAKING — aliased commands keep their real exit code.** An alias for a
  command that fails now propagates the command's exit code (e.g. `watch`'s
  exit 8, auth 77, usage 64) instead of collapsing every failure to 1, and
  prints the error message it previously swallowed.
- **Mutations honor `--output`.** Every delete/remove, both converts,
  `deal bulk-update`, `person`/`org import`, and `backup` now emit a structured
  JSON/yaml/csv object (honoring `--jq`/`--fields`) instead of prose on stdout;
  the converts expose the new record id (`deal_id`/`lead_id`) in JSON. Human
  one-liners remain in interactive table mode.
- `--fields` now projects keys for `json`/`yaml` output, not only table/csv.

### Fixed — other

- `pdcli api` reads a body piped on stdin (the documented behavior was
  unreachable); a usage/parse error in a TTY now honors an explicit
  `--output json`.
- `search --item-types <one> --limit` is clamped to 100 (the scoped endpoint
  rejects more) instead of surfacing a confusing API 400.
- `deal history --limit` caps how much it fetches instead of walking the whole
  changelog; bulk-target parsing rejects blank/zero/`undefined` ids and
  malformed piped JSON; `digest` rejects `--format` combined with `--output`.

### Chore

- `npm run docs:commands` builds the manifest first (worked from a dirty tree
  only); removed the unused `undici` dependency; added the 10 missing
  `--help` topic descriptions; config tests isolate the store (`PDCLI_CONFIG_DIR`)
  so they never touch your real profiles.

## [0.17.0] - 2026-06-11

Contract-hardening release — the last changes to the machine-facing surface
(exit codes + error output) before the 1.0 stability freeze.

### Changed

- **BREAKING — usage errors now exit 64, not 70.** Malformed invocations
  (unknown flag, missing argument, invalid flag value) are oclif parse errors;
  they previously fell through to exit 70 (`EX_SOFTWARE`, "internal bug") and
  now correctly exit 64 (`EX_USAGE`) per the sysexits ladder. Exit 70 is now
  reserved for genuinely unexpected internal failures. Scripts branching on the
  exit code should treat 64 as "fix your command line".
- **BREAKING — piped errors emit JSON.** Error output now follows the same
  format resolution as success output: human (`table`) in a TTY, but a JSON
  envelope (`{ error, message, exitCode, … }`) on stderr whenever output is a
  machine format — `--output json|yaml|csv`, a non-`table` profile
  `default_output`, **or when stdout is piped**. Previously a piped run emitted
  JSON on success but human text on failure; a non-interactive consumer now
  always gets a parseable error. Pass `--output table` to force human errors.

### Fixed

- OAuth: a token that expired _during_ a 429 backoff is now refreshed. The
  refresh was gated on the first attempt, so a rate-limit retry consumed the
  window and the later 401 failed unrecoverably; the refresh is now a single
  free round independent of the retry budget (works under `--no-retry` too).
- CSV/`--field`: a field definition missing `field_name` no longer throws when
  matching by hash code (null-guarded, matching the other resolvers).
- Error reporting no longer crashes if reading the profile's `default_output`
  throws (e.g. a corrupt config) while formatting another error.

## [0.16.0] - 2026-06-11

### Added

- Idempotent writes — match-or-create that never guesses:
  - `person upsert`, `org upsert`, `deal upsert` — match a record by `--by`
    (a built-in key — person email/name/phone, org name, deal title — or a
    searchable custom field), then **create** it if absent or **PATCH only the
    changed fields** if exactly one matches. More than one match **refuses with
    exit 65** rather than writing the wrong record: search `exact_match` is not
    a unique key, so every candidate is re-verified client-side before the
    count decides. `--dry-run` previews the action; table prints a one-line
    summary, `--output json` emits the full action result.
  - `person import --upsert --match-on <field>` and the same on `org import` —
    the CSV equivalent: each row is matched on its `--match-on` value, then
    created or PATCHed. Per-row failures (ambiguous matches, empty match
    values) are collected without aborting the batch and reported as
    `created / updated / unchanged` counts; a batch whose failures are all
    data-validation errors exits 65, otherwise 1. `--dry-run` looks up and
    reports the counts without writing.

### Changed

- `diffBody` (upsert) compares emails/phones by their value set
  (case-insensitive, ignoring the `primary`/`label` flags the API echoes) and
  treats `label_ids` and multi-option custom fields order-insensitively, so
  re-running an unchanged upsert issues no PATCH.
- CSV import now rejects duplicate column headers (exit 65) instead of silently
  keeping only the last cell.

## [0.15.0] - 2026-06-11

### Added

- Continuous automation primitives:
  - `watch` — anomaly poller built on the hygiene checks: emits only the
    findings that are **NEW since the last run** (a per-profile state),
    and exits **8** when new findings arm the gate (default: must-severity)
    so cron can branch — `pdcli watch || notify`. `--peek` reads without
    advancing state; `--checks` narrows the checks; `--severity must|should|all`
    arms the gate. A finding that clears and later re-trips fires again.
  - `sync warehouse` — **incremental** NDJSON export for a data warehouse.
    Appends only records changed since the last run, per entity, with
    independent high-water marks in `manifest.json`; the first run seeds a
    full export and `--full` rebuilds from scratch. `--since` overrides the
    start. Pull-based CDC captures creates/updates only — hard deletes are
    not surfaced (reconcile against a periodic full `backup`).

### Changed

- Hoisted the shared `--since` parser (`resolveSince`) into
  `src/lib/period.js` so `changes` and `sync warehouse` share one
  implementation. No behavior change.

## [0.14.0] - 2026-06-11

### Added

- Agent & CI primitives — built for cron jobs and AI agents:
  - `changes` — incremental change feed across deals, persons,
    organizations, activities and products with a **self-advancing
    per-profile watermark**: each run resumes where the last left off and
    advances to the newest change, tagging every row `created` vs
    `updated`. `--since <ts|Nd>` sets/overrides the start; `--peek` reads
    without advancing. Turnkey for `*/5 * * * * pdcli changes | …`.
  - `deal context <id>` — one-call denormalized bundle (deal + person +
    org + activities + notes + products + participants) with custom
    fields resolved to names and derived risk flags (missing contact,
    stale, past close, no next activity). It does the joins v2's API
    won't (there is no `related_objects`). `--no-activities/-notes/
-products/-participants` trim the cost.
  - `backup diff <A> <B>` — field-level diff between two backup snapshots,
    computed entirely locally with **zero API calls**. Reports added /
    removed / modified records and per-field changes, resolving custom
    field names from each snapshot's own captured schema (`--raw` keeps
    hash keys). `backup` is now a topic.

## [0.13.0] - 2026-06-10

### Added

- The "Monday packet" — forecasting, rep performance, and a one-command
  digest that fans a single fetch into the existing analytics:
  - `metrics forecast` — open pipeline bucketed by close-month into
    **commit / best-case / weighted** views. Commit counts deals whose
    effective win-probability (`--commit-threshold`, default 70) clears
    the bar, at full value; weighted uses
    `deal probability ?? stage default ?? 100`. Values are **segregated
    per currency** (never cross-summed), with a per-currency totals line.
  - `rep scorecard` — per-owner win rate, cycle, velocity and deal
    hygiene (stale / past-close / no-date / no-contact), with owner names
    resolved from the users roster. Account-wide by default; narrow with
    `--pipeline`, `--owner`, `--period`.
  - `digest` — the whole packet from ONE pipeline-scoped fetch: velocity,
    pipeline health, coverage, funnel, forecast and must-fix hygiene.
    Cheap by default; `--deep` mines per-deal changelogs to add aging,
    slippage and stage-skips. `--format md|html` (optionally `--out
<file>`) renders a shareable artifact for cron → Slack/email; a
    missing revenue goal degrades to no coverage section rather than
    failing.

### Changed

- Extracted the duplicated `>1-pipeline` guard and the Goals-API
  resolution recipe into shared `src/lib/pipelines.js` and
  `src/lib/goals.js`; the seven pipeline-scoped commands now share one
  tested implementation. No behavior change.

### Fixed

- `metrics coverage` no longer blind-sums open value across currencies
  (a meaningless cross-currency ratio against a single-currency quota).
  A multi-currency open pipeline now errors with exit 64; scope it with
  the new `--currency <code>` flag. `digest` applies the same guard by
  omitting its coverage section (with a stderr note) on mixed currencies.

## [0.12.0] - 2026-06-06

### Added

- Time-intelligence analytics, each mining real stage/close-date
  history from per-deal changelogs (20 tokens/deal; a >100-deal
  warning prints once):
  - `metrics aging` — days-in-current-stage bucketed
    (`--buckets`, default 30,60,90) with per-stage p50/p90 dwell
    baselines; flags deals past their stage's p90.
  - `metrics slippage` — `expected_close_date` pushes: count, net days
    slipped, original→current close date, serial offenders
    (`--min-pushes`).
  - `metrics conversion-matrix` — full stage-to-stage transition counts
    including backward edges and won/lost terminals (the flow graph the
    funnel collapses).
  - `audit stage-skips` — forward gate-skips and backward regressions
    with actor attribution (informational; always exits 0).

## [0.11.0] - 2026-06-06

### Added

- Custom-field lifecycle: `field create/update/delete` plus
  `field option add/remove` for enum/set fields (v2 Fields write API).
  Deleting a field or option confirms with a default of No — record
  data stored in it is lost. `field list/get` now also cover `lead`
  and `note` fields.
- Relations: `deal participant list/add/remove` (the buying
  committee), `deal/person/org follower list/add/remove`, and
  `org relationship list/add/remove` (parent/related hierarchies).
- `task list/get/create/update/delete` — v2-native project tasks
  (requires the Projects add-on; accounts without it get a clean
  configuration error).
- Conversions: `lead convert <id>` and `deal convert <id>` (async jobs
  with `--wait` polling and `--timeout-secs`). Converting a deal
  deletes the source deal on success and confirms with a default of
  No.
- `deal summary` — server-side per-currency totals, weighted values,
  and counts in a single call (`--status/--pipeline/--stage/--filter`).
- Scoped search: a single `--item-types` value routes `search` to the
  per-entity v2 endpoints; the deal scope adds
  `--status/--person/--org` filters.
- `deal list --archived` and `project list --archived`.
- `activity type list` (the `key_string` column feeds
  `activity --type`), `file update/delete`, `filter delete`, and
  `note comment list/add/update/delete`.

### Changed

- Every destructive command added in this release confirms with a
  default of No — pressing Enter aborts.

## [0.10.0] - 2026-06-06

### Added

- `deal product list/add/update/remove` — line items on deals at last.
  Cursor-paginated listing with sort options; `add` takes `--product`,
  `--price`, and `--quantity` (default 1) plus discount/tax/comments;
  amounts are validated client-side (exit 64 on garbage). No
  `--duration` flag: product durations were retired by Pipedrive in
  2024 in favor of billing frequencies.
- `user list` and `user find <term>` (`--by-email` for exact lookups) —
  every `--owner <id>` flag in the CLI is finally usable without
  copying ids out of the web app.
- List power-params on `deal`, `person`, `org`, `activity`, and
  `product` lists: `--filter <saved-filter-id>`, `--ids` (max 100),
  `--sort-by`/`--sort-direction`, `--updated-since`/`--updated-until`
  where the endpoint supports them. `--ids` and `--filter` are mutually
  exclusive — the API silently ignores ids when a filter is present.
- `deal history <id>` — field-change audit trail, newest-first, with
  `--field` filtering and `--resolve-fields` rendering custom-field
  names and option labels.
- `webhook create --event-object` accepts the six v2 object types added
  for projects and line items (project, task, board, phase,
  deal_product, deal_installment).
- Daily-budget awareness: a 429 with `x-daily-ratelimit-token-remaining: 0`
  fails fast with a clear message instead of backing off blindly;
  `--verbose` logs the remaining daily token budget on every request.

### Changed

- List page size raised from 100 to 500 rows per request (the v2
  maximum) — large pulls use 5x fewer requests and rate-limit tokens.

### Fixed

- `activity list --type` never worked against the live API (the v2
  endpoint rejects a `type` query parameter); the flag now filters
  client-side.

## [0.9.0] - 2026-06-05

### Changed

- **BREAKING:** `--jq` now receives single records as the bare object
  instead of a one-element array. `pdcli deal get 1 --jq '.id'` works
  directly; scripts using the old `--jq '.[0].id'` form must drop the
  `.[0]`. List output is unchanged (still an array).
- `--resolve-fields` now also applies to the core list commands (`deal`,
  `person`, `org`, `activity`, `product`) in json/yaml/csv output — one
  field-definitions fetch covers the whole list. (Supersedes the 0.8.0
  note that scoped the flag to single-record gets.)

### Fixed

- File uploads, downloads, and form posts now go through the same
  transport pipeline as every other request: 429 backoff honoring
  `x-ratelimit-reset`/`Retry-After`, `--no-retry`, the 429-to-403
  escalation hard stop, 5xx retry, and automatic OAuth token refresh.
  Note: this also means transient 5xx during an upload is retried —
  pass `--no-retry` if duplicate-creation on retry is a concern.
- Alias mutations take an advisory lock, so concurrent pdcli processes
  no longer overwrite each other's alias changes (last-write-wins data
  loss). Contention exits 75; an unwritable config directory reports a
  clear configuration error (exit 78).
- A failing command can no longer pass its own happy-path test suite —
  the test harness surfaces command errors instead of swallowing them.

## [0.8.0] - 2026-06-05

### Added

- `person merge <id> --into <survivor>` and `org merge <id> --into <survivor>`
  — fold duplicate records via Pipedrive's native merge. The positional id is
  the losing record (deleted); the confirmation names both records and
  defaults to No. `--yes` skips the prompt for scripts.
- `funnel --exact` — mines real stage transitions from each deal's changelog
  instead of approximating from final stages. Stage entry is derived from the
  transition graph, so deals created mid-funnel count only the stages they
  actually entered. Failed changelog fetches are skipped with a warning.
  Machine output is `{ rows, won }`.
- `metrics coverage` — open pipeline vs the revenue still needed for quota.
  The classic 3x rule drives the verdict on raw pipeline value; a
  probability-weighted coverage ratio is reported alongside. Quota comes from
  active revenue goals (Goals API) or `--target`. Goals in mixed currencies
  refuse to sum (exit 64).
- `alias set/list/unset` — user-defined command shortcuts, expanded by the
  command-not-found hook. Cycles, self-references, topic shadowing, and
  dotted names are rejected at write time; runtime expansion is guarded
  against cycles and runaway depth. Destructive payloads warn at set time.
- `--resolve-fields` — opt-in resolution of custom-field hash keys to names
  (and option ids to labels) in JSON/yaml/csv output of single-record get
  commands. Duplicate field names disambiguate instead of clobbering.
- `audit` duplicate-orgs now also reports fuzzy near-matches
  (Jaro-Winkler 0.92+) with original org names and a score, tagged
  `kind: "fuzzy"`.
- `config unset <key>`; `config set default_output` validates its value.
- `lead label list` and `file remote-link` (link a Google Drive file to a
  deal, person, or organization).
- Animated terminal demo in the README; CONTRIBUTING guide (repo + docs site).

### Changed

- **audit output contract:** duplicate-orgs items now carry a `kind` field
  (`exact` | `fuzzy` | `note`); fuzzy items use `names` (plural) and `score`.
  The per-check `count` counts findings only (informational notes excluded)
  and now includes fuzzy matches — consumers gating on duplicate-orgs counts
  should account for the new kinds.
- Aborting a confirmation prompt with Ctrl-C or a closed stdin now exits
  cleanly as "Aborted" instead of an internal error.

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
