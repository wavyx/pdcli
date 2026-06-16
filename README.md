# pdcli

[![npm version](https://img.shields.io/npm/v/@wavyx/pdcli)](https://www.npmjs.com/package/@wavyx/pdcli)
[![CI](https://github.com/wavyx/pdcli/actions/workflows/ci.yml/badge.svg)](https://github.com/wavyx/pdcli/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/wavyx/pdcli/branch/main/graph/badge.svg)](https://codecov.io/gh/wavyx/pdcli)
[![npm downloads](https://img.shields.io/npm/dm/@wavyx/pdcli)](https://www.npmjs.com/package/@wavyx/pdcli)
[![Node.js](https://img.shields.io/node/v/@wavyx/pdcli)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-wavyx.github.io%2Fpdcli-1292EE)](https://wavyx.github.io/pdcli/)

<p align="center">
  <img src="https://raw.githubusercontent.com/wavyx/pdcli/main/docs/demo.webp" alt="pdcli demo — pipeline health, deal summary, and pipeline coverage" width="760">
</p>

Command-line interface for [Pipedrive](https://www.pipedrive.com/) — fast, scriptable, built for terminals, CI pipelines, and AI agents.

Covers the **v2 CRM core** (deals, persons, organizations, activities, products,
pipelines, projects) and the **v1 domains** (leads, notes, files, filters,
webhooks, goals) — plus time-intelligence analytics, idempotent match-or-create
sync, and a full account **backup**. JSON output, deterministic exit codes, and a
host-locked raw `api` escape hatch make it a clean way to drive Pipedrive from CI
and **AI agents** (Claude Code, Codex, and similar) — no SDK glue required.

📖 **Documentation:** <https://wavyx.github.io/pdcli/>

> Not affiliated with or endorsed by Pipedrive.

## Install

```bash
npm install -g @wavyx/pdcli   # Node.js 20+
```

The binary is `pdcli`.

## Authenticate

```bash
pdcli auth login            # personal API token (app.pipedrive.com/settings/api)
pdcli auth login --oauth    # OAuth 2.0 via your own Developer Hub app
pdcli auth status
```

Credentials live **only in your OS keychain** — never in plaintext on disk. OAuth
access tokens refresh automatically. CI/scripts can use env vars instead:
`PDCLI_COMPANY_DOMAIN=acme PDCLI_API_TOKEN=... pdcli deal list`

## Read

```bash
pdcli deal list --status open --limit 20
pdcli deal get 42
pdcli person list --org 7 --jq '.[].id'
pdcli activity list --todo
pdcli lead list
pdcli note list --deal 42
pdcli pipeline list && pdcli stage list --pipeline 1
pdcli search "acme"
pdcli field list deal           # custom fields with their hash keys
pdcli user list                 # resolve owner IDs to names
pdcli deal history 42           # field-change audit trail: who changed what, when
```

Output everywhere: `--output table|json|yaml|csv`, `--jq '<expr>'`, `--fields id,name`.

## Write

```bash
pdcli deal create --title "Acme renewal" --value 5000 --currency EUR --stage 3
pdcli deal update 42 --status won
pdcli activity create --subject "Follow up" --type call --due-date 2026-06-10 --deal 42
pdcli product create --name "Consulting" --price 150 --currency EUR
pdcli lead convert <id> --wait  # promote a lead to a deal; --wait polls the async job
pdcli deal delete 42            # asks first; --yes to skip
```

Custom fields by **human name** — labels and option IDs resolve automatically:

```bash
pdcli deal create --title "Sized" --field "Deal Size=Large" --field "Score=4.5"
pdcli deal update 42 --body '{"probability":75}'   # raw JSON escape hatch
pdcli field create deal --name "Budget" --type double   # manage the field schema itself
```

## Line items & relations

```bash
pdcli deal product add 42 --product 10 --price 150 --quantity 4   # attach a product to a deal
pdcli deal product list 42                                        # lines, with server-computed sums
pdcli deal participant add 42 --person 10                         # add to the buying committee
pdcli deal follower add 42 --user 5                               # follow a deal/person/org
pdcli org relationship add --type parent --owner 1481 --linked 1480  # org hierarchy
```

## Bulk

```bash
pdcli deal bulk-update --filter 9 --stage 5            # saved filter → stage move
pdcli deal bulk-update --ids 1,2,3 --status won --yes
pdcli deal list --status open --jq '.[].id' | pdcli deal bulk-update --owner 42
pdcli person import people.csv --dry-run               # CSV headers map to fields,
pdcli person import people.csv                         # custom fields by name
```

## Idempotent writes

Match-or-create, safe to re-run. More than one match **refuses** (exit 65) —
never guesses which record to write.

```bash
pdcli person upsert a@x.com --by email --field "Tier=Gold"   # create or PATCH only what changed
pdcli deal upsert "Acme expansion" --by title --body '{"value":5000}'
pdcli org upsert "D-42" --by "External ID" --field "Status=Active" --dry-run  # preview
pdcli person import contacts.csv --upsert --match-on email   # CSV: per-row create-or-update
```

## Analytics & housekeeping

```bash
pdcli deal summary --status open         # server-side per-currency totals, weighted, count
pdcli metrics velocity --period 90d      # the Sales Velocity Equation, in your terminal
pdcli funnel --pipeline 1                # stage-to-stage conversion
pdcli funnel --exact                     # mine real stage transitions per deal (one call each)
pdcli metrics coverage --target 500000   # weighted pipeline vs quota — the 3x coverage rule
pdcli metrics aging --pipeline 1         # days-in-stage bucketed, per-stage p90 dwell flag
pdcli metrics slippage --min-pushes 2    # open deals whose close date keeps getting pushed
pdcli pipeline health                    # per-stage value, weighted value, stale, no-next-step
pdcli audit                              # 11 data-hygiene checks (duplicates, stale, gaps)
pdcli audit --strict                     # exit 1 on must-severity findings — wire into CI
pdcli person merge 123 --into 456        # fold a duplicate into the survivor (deletes 123)
```

## Files, webhooks, backup

```bash
pdcli file upload ./contract.pdf --deal 42
pdcli file download 15 --out ./contract.pdf
pdcli webhook create --url https://ci.example.com/hook --event-action create --event-object deal
pdcli backup --dir ./pipedrive-backup    # full account → JSON tree, --resume to continue
```

## Anything else

```bash
pdcli api GET /api/v2/pipelines          # raw, host-locked to YOUR domain
pdcli api POST /api/v2/deals --body '{"title":"Raw deal"}'
pdcli alias set wd "deal list --status won"   # save a shortcut, then run: pdcli wd
pdcli doctor                             # diagnose auth/keychain/connectivity
```

- `--output table|json|yaml|csv` everywhere; table in a TTY, JSON when piped.
- Deterministic [sysexits](https://man.freebsd.org/cgi/man.cgi?query=sysexits) exit codes for scripting.

## Commands

| Topic                      | Commands                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pdcli auth`               | `login`, `logout`, `status` — token or OAuth, stored in the OS keychain                                                                                |
| `pdcli deal`               | `list`, `get`, `create`, `update`, `delete`, `upsert`, `convert`, `history`, `context`, `summary`, `bulk-update`, `follower`, `participant`, `product` |
| `pdcli person`             | `list`, `get`, `create`, `update`, `delete`, `upsert`, `import`, `merge`, `follower`                                                                   |
| `pdcli org`                | `list`, `get`, `create`, `update`, `delete`, `upsert`, `import`, `merge`, `follower`, `relationship`                                                   |
| `pdcli activity`           | `list`, `get`, `create`, `update`, `delete`, `type`                                                                                                    |
| `pdcli lead`               | `list`, `get`, `create`, `update`, `delete`, `convert`, `label`                                                                                        |
| `pdcli note`               | `list`, `get`, `create`, `update`, `delete`, `comment`                                                                                                 |
| `pdcli product`            | `list`, `get`, `create`, `update`, `delete`                                                                                                            |
| `pdcli pipeline` / `stage` | `list`, `get`; `pipeline health` per-stage value/weighted/stale                                                                                        |
| `pdcli project` / `task`   | `list`, `get`, `create`, `update`, `delete`                                                                                                            |
| `pdcli field`              | `list`, `get`, `create`, `update`, `delete`, `option` — manage the custom-field schema                                                                 |
| `pdcli file`               | `list`, `get`, `upload`, `download`, `remote-link`, `update`, `delete`                                                                                 |
| `pdcli filter` / `webhook` | `filter list`/`get`/`delete`; `webhook list`/`create`/`delete`                                                                                         |
| `pdcli goal` / `user`      | `goal list`; `user me`/`list`/`find` — resolve owner IDs to names                                                                                      |
| `pdcli search`             | global item search across entities                                                                                                                     |
| `pdcli metrics`            | `velocity`, `coverage`, `forecast`, `aging`, `slippage`, `conversion-matrix` — time-intelligence from changelogs                                       |
| `pdcli funnel` / `rep`     | `funnel` stage-to-stage conversion (`--exact` mines transitions); `rep scorecard` per-owner                                                            |
| `pdcli audit`              | data-hygiene checks (`--strict` exits 1 for CI); `audit stage-skips`                                                                                   |
| `pdcli digest`             | the whole Monday packet in one fetch (`--format md\|html --out` for cron → Slack/email)                                                                |
| `pdcli changes`            | incremental cross-entity change feed with a self-advancing watermark                                                                                   |
| `pdcli watch`              | exit-code-gated anomaly poller — exits `8` on new findings (`pdcli watch \|\| notify`)                                                                 |
| `pdcli sync`               | `warehouse` — incremental NDJSON export with per-entity high-water marks                                                                               |
| `pdcli backup`             | full account dump (`--resume`); `backup diff` for a zero-API field-level diff of two snapshots                                                         |
| `pdcli api`                | raw escape hatch: `pdcli api GET /api/v2/deals` — host-locked to your company domain                                                                   |
| `pdcli profile` / `config` | `profile list`/`use`/`current`; `config get`/`set`/`list`/`unset`                                                                                      |
| `pdcli alias`              | `set`, `list`, `unset` — custom command shortcuts                                                                                                      |
| `pdcli doctor` / `version` | diagnose auth/keychain/connectivity; version info                                                                                                      |

Run `pdcli --help` or `pdcli <topic> --help` for details. Every list/get command
supports `--output table|json|yaml|csv`, `--jq`, and `--fields`.

## Documentation

- [Guides, cookbook & AI-agent quickstart](https://wavyx.github.io/pdcli/)
- [`llms.txt`](https://wavyx.github.io/pdcli/llms.txt) — the docs as plain text for agents
- [Command reference](docs/commands.md) — generated from the CLI manifest

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Eric Rodriguez
