---
title: Commands
description: Full command reference for the pdcli command-line interface.
---

<!-- AUTO-GENERATED from the oclif manifest by scripts/gen-commands.mjs — do not edit by hand. -->

Reference for `pdcli` v0.1.0 (24 commands). Every command also accepts the global flags `--output table|json`, `--profile`, `--no-color`, `--verbose`, `--no-retry`, `--timeout`, and `--limit`.

## Top-level

### `pdcli api`

Make a raw API request (host-locked to your Pipedrive company domain)

```
pdcli api <method> <path> [flags]
```

- `--body <value>` — Request body (JSON string, @file, or pipe stdin)

Examples:

```bash
pdcli api GET /api/v2/deals
pdcli api GET /api/v1/currencies
pdcli api POST /api/v2/deals --body '{"title":"New deal"}'
pdcli api DELETE /api/v1/webhooks/1
```

### `pdcli doctor`

Run diagnostic checks on the CLI environment

```
pdcli doctor [flags]
```

Examples:

```bash
pdcli doctor
```

### `pdcli search`

Search across deals, persons, organizations, products, leads, files, and projects

```
pdcli search <term> [flags]
```

- `--item-types <value>` — Comma-separated item types (deal,person,organization,product,lead,file,mail_attachment,project)
- `--exact` — Exact match (allows 1-character terms)

Examples:

```bash
pdcli search "acme"
pdcli search "acme" --item-types deal,person --output json
```

### `pdcli version`

Show CLI version and environment info

```
pdcli version [flags]
```

Examples:

```bash
pdcli version
```

## pdcli activity

### `pdcli activity get`

Get an activity by ID

```
pdcli activity get <id> [flags]
```

Examples:

```bash
pdcli activity get 9
pdcli activity get 9 --output json
```

### `pdcli activity list`

List activities

```
pdcli activity list [flags]
```

- `--owner <value>` — Filter by owner (user) ID
- `--deal <value>` — Filter by deal ID
- `--person <value>` — Filter by person ID
- `--org <value>` — Filter by organization ID
- `--type <value>` — Filter by activity type key
- `--done` — Only completed activities
- `--todo` — Only open (not done) activities

Examples:

```bash
pdcli activity list
pdcli activity list --todo --deal 42
pdcli activity list --type call --output json
```

## pdcli auth

### `pdcli auth login`

Authenticate with Pipedrive using your personal API token

```
pdcli auth login [flags]
```

- `--company <value>` — Company domain ("acme" from acme.pipedrive.com — full URL accepted)
- `--api-token <value>` — Personal API token (app.pipedrive.com/settings/api). Prefer the prompt or env so the token stays out of shell history

Examples:

```bash
pdcli auth login
pdcli auth login --company acme --api-token <token>
pdcli auth login --profile work
```

### `pdcli auth logout`

Log out and remove the stored API token

```
pdcli auth logout [flags]
```

Examples:

```bash
pdcli auth logout
```

### `pdcli auth status`

Show current authentication status

```
pdcli auth status [flags]
```

Examples:

```bash
pdcli auth status
```

## pdcli config

### `pdcli config get`

Get a config value for the active profile

```
pdcli config get <key> [flags]
```

Examples:

```bash
pdcli config get company_domain
pdcli config get default_output
```

### `pdcli config list`

List all config for the active profile

```
pdcli config list [flags]
```

Examples:

```bash
pdcli config list
```

### `pdcli config set`

Set a config value for the active profile

```
pdcli config set <key> <value> [flags]
```

Examples:

```bash
pdcli config set company_domain acme
pdcli config set default_output json
```

## pdcli deal

### `pdcli deal get`

Get a deal by ID

```
pdcli deal get <id> [flags]
```

Examples:

```bash
pdcli deal get 42
pdcli deal get 42 --output json
```

### `pdcli deal list`

List deals

```
pdcli deal list [flags]
```

- `--status <open|won|lost|deleted>` — Filter by status
- `--stage <value>` — Filter by stage ID
- `--pipeline <value>` — Filter by pipeline ID
- `--owner <value>` — Filter by owner (user) ID
- `--person <value>` — Filter by person ID
- `--org <value>` — Filter by organization ID

Examples:

```bash
pdcli deal list
pdcli deal list --status won --limit 50
pdcli deal list --stage 3 --output json
```

## pdcli field

### `pdcli field get`

Show one field by human name or hashed key

```
pdcli field get <entity> <field> [flags]
```

Examples:

```bash
pdcli field get deal "Deal Size"
pdcli field get deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12
```

### `pdcli field list`

List fields for an entity, including custom-field hash keys

```
pdcli field list <entity> [flags]
```

Examples:

```bash
pdcli field list deal
pdcli field list person --output json
```

## pdcli org

### `pdcli org get`

Get an organization by ID

```
pdcli org get <id> [flags]
```

Examples:

```bash
pdcli org get 7
pdcli org get 7 --output json
```

### `pdcli org list`

List organizations

```
pdcli org list [flags]
```

- `--owner <value>` — Filter by owner (user) ID

Examples:

```bash
pdcli org list
pdcli org list --owner 3 --output json
```

## pdcli person

### `pdcli person get`

Get a person by ID

```
pdcli person get <id> [flags]
```

Examples:

```bash
pdcli person get 5
pdcli person get 5 --output json
```

### `pdcli person list`

List persons (contacts)

```
pdcli person list [flags]
```

- `--owner <value>` — Filter by owner (user) ID
- `--org <value>` — Filter by organization ID

Examples:

```bash
pdcli person list
pdcli person list --org 7 --output json
```

## pdcli profile

### `pdcli profile current`

Show the active profile

```
pdcli profile current [flags]
```

Examples:

```bash
pdcli profile current
```

### `pdcli profile list`

List all configured profiles

```
pdcli profile list [flags]
```

Examples:

```bash
pdcli profile list
```

### `pdcli profile use`

Switch the active profile

```
pdcli profile use <name> [flags]
```

Examples:

```bash
pdcli profile use work
```

## pdcli user

### `pdcli user me`

Show the authenticated user

```
pdcli user me [flags]
```

Examples:

```bash
pdcli user me
```

