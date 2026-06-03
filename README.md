# pdcli

Command-line interface for [Pipedrive](https://www.pipedrive.com/) — fast, scriptable, built for terminals, CI pipelines, and AI agents.

> **Status: pre-release (v0.1 in development).** Not affiliated with or endorsed by Pipedrive.

## Install

```bash
npm install -g @wavyx/pdcli
```

## Quick start

```bash
pdcli auth login          # company domain + API token (stored in your OS keychain)
pdcli user me
pdcli deal list --limit 10
pdcli deal list --output json | jq '.[].id'
pdcli field list deal     # custom fields with their hash keys
pdcli search "acme"
pdcli api GET /api/v1/currencies   # raw, host-locked escape hatch
```

- Token lives **only** in the OS keychain — never in plaintext on disk.
- `--output table|json` on every command; table in a TTY, JSON when piped.
- Deterministic [sysexits](https://man.freebsd.org/cgi/man.cgi?query=sysexits) exit codes for scripting.
- CI: `PDCLI_COMPANY_DOMAIN=acme PDCLI_API_TOKEN=... pdcli deal list`

## License

MIT
