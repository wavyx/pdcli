# pdcli

[![CI](https://github.com/wavyx/pdcli/actions/workflows/ci.yml/badge.svg)](https://github.com/wavyx/pdcli/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/wavyx/pdcli/branch/main/graph/badge.svg)](https://codecov.io/gh/wavyx/pdcli)
[![npm](https://img.shields.io/npm/v/%40wavyx%2Fpdcli)](https://www.npmjs.com/package/@wavyx/pdcli)

Command-line interface for [Pipedrive](https://www.pipedrive.com/) — fast, scriptable, built for terminals, CI pipelines, and AI agents.

> Not affiliated with or endorsed by Pipedrive.

## Install

```bash
npm install -g @wavyx/pdcli
```

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
```

Output everywhere: `--output table|json|yaml|csv`, `--jq '<expr>'`, `--fields id,name`.

## Write

```bash
pdcli deal create --title "Acme renewal" --value 5000 --currency EUR --stage 3
pdcli deal update 42 --status won
pdcli activity create --subject "Follow up" --type call --due-date 2026-06-10 --deal 42
pdcli product create --name "Consulting" --price 150 --currency EUR
pdcli deal delete 42            # asks first; --yes to skip
```

Custom fields by **human name** — labels and option IDs resolve automatically:

```bash
pdcli deal create --title "Sized" --field "Deal Size=Large" --field "Score=4.5"
pdcli deal update 42 --body '{"probability":75}'   # raw JSON escape hatch
```

## Bulk

```bash
pdcli deal bulk-update --filter 9 --stage 5            # saved filter → stage move
pdcli deal bulk-update --ids 1,2,3 --status won --yes
pdcli deal list --status open --jq '.[].id' | pdcli deal bulk-update --owner 42
pdcli person import people.csv --dry-run               # CSV headers map to fields,
pdcli person import people.csv                         # custom fields by name
```

## Analytics & housekeeping

```bash
pdcli metrics velocity --period 90d      # the Sales Velocity Equation, in your terminal
pdcli funnel --pipeline 1                # stage-to-stage conversion
pdcli pipeline health                    # per-stage value, weighted value, stale, no-next-step
pdcli audit                              # 11 data-hygiene checks (duplicates, stale, gaps)
pdcli audit --strict                     # exit 1 on must-severity findings — wire into CI
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
pdcli doctor                             # diagnose auth/keychain/connectivity
```

- `--output table|json|yaml|csv` everywhere; table in a TTY, JSON when piped.
- Deterministic [sysexits](https://man.freebsd.org/cgi/man.cgi?query=sysexits) exit codes for scripting.
- **Docs: [wavyx.github.io/pdcli](https://wavyx.github.io/pdcli)** — guides, cookbook, AI-agent quickstart, [`llms.txt`](https://wavyx.github.io/pdcli/llms.txt).
- Full reference: [docs/commands.md](docs/commands.md) (generated from the CLI manifest).

## License

MIT
