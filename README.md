# pdcli

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
pdcli person list --org 7 --output json | jq '.[].id'
pdcli activity list --todo
pdcli search "acme"
pdcli field list deal           # custom fields with their hash keys
```

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

## Anything else

```bash
pdcli api GET /api/v2/pipelines          # raw, host-locked to YOUR domain
pdcli api POST /api/v2/deals --body '{"title":"Raw deal"}'
pdcli doctor                             # diagnose auth/keychain/connectivity
```

- `--output table|json` everywhere; table in a TTY, JSON when piped.
- Deterministic [sysexits](https://man.freebsd.org/cgi/man.cgi?query=sysexits) exit codes for scripting.
- Full reference: [docs/commands.md](docs/commands.md) (generated from the CLI manifest).

## License

MIT
