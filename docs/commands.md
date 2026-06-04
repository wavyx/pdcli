---
title: Commands
description: Full command reference for the pdcli command-line interface.
---

<!-- AUTO-GENERATED from the oclif manifest by scripts/gen-commands.mjs — do not edit by hand. -->

Reference for `pdcli` v0.5.0 (78 commands). Every command also accepts the global flags `--output table|json`, `--profile`, `--no-color`, `--verbose`, `--no-retry`, `--timeout`, and `--limit`.

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

### `pdcli audit`

Data-quality audit: stale deals, missing fields, duplicates, overdue pileups

```
pdcli audit [flags]
```

- `--checks <value>` — Comma-separated subset of checks (stale-deals, no-next-activity, past-close-date, missing-fields, ancient-deals, missing-close-time, duplicate-persons, uncontactable-persons, duplicate-orgs, overdue-activities, currency-missing)
- `--strict` — Exit 1 when any must-severity check has findings

Examples:

```bash
pdcli audit
pdcli audit --checks stale-deals,duplicate-persons --verbose
pdcli audit --strict   # exit 1 on must-severity findings (CI)
```

### `pdcli backup`

Export the whole account to a JSON tree (resumable, one file per resource)

```
pdcli backup [flags]
```

- `--dir <value>` — Target directory for the export
- `--resume` — Skip resources already completed in a previous run

Examples:

```bash
pdcli backup
pdcli backup --dir ./my-backup
pdcli backup --dir ./my-backup --resume
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

### `pdcli funnel`

Stage-to-stage conversion approximated from closed deals (final stage reached)

```
pdcli funnel [flags]
```

- `--period <value>` — Trailing window for closed deals (Nd or Nm)
- `--pipeline <value>` — Pipeline ID (required when the account has several)

Examples:

```bash
pdcli funnel
pdcli funnel --pipeline 1 --period 180d
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

### `pdcli activity create`

Create an activity

```
pdcli activity create [flags]
```

- `--subject <value>` _(required)_ — Activity subject
- `--type <value>` — Activity type
- `--due-date <value>` — Due date (YYYY-MM-DD)
- `--due-time <value>` — Due time (HH:MM)
- `--duration <value>` — Duration (HH:MM)
- `--deal <value>` — Linked deal ID
- `--person <value>` — Linked person ID
- `--org <value>` — Linked organization ID
- `--owner <value>` — Owner (user) ID
- `--note <value>` — Activity note
- `--done` — Mark the activity as done
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli activity create --subject "Demo call" --type call --due-date 2026-06-10
pdcli activity create --subject "Follow up" --field "Outcome=Positive"
pdcli activity create --subject "Raw" --body '{"priority":5}'
```

### `pdcli activity delete`

Delete an activity

```
pdcli activity delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli activity delete 9
pdcli activity delete 9 --yes
```

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

### `pdcli activity update`

Update an activity (v2 PATCH — only provided fields change)

```
pdcli activity update <id> [flags]
```

- `--subject <value>` — Activity subject
- `--type <value>` — Activity type
- `--due-date <value>` — Due date (YYYY-MM-DD)
- `--due-time <value>` — Due time (HH:MM)
- `--duration <value>` — Duration (HH:MM)
- `--deal <value>` — Linked deal ID
- `--person <value>` — Linked person ID
- `--org <value>` — Linked organization ID
- `--owner <value>` — Owner (user) ID
- `--note <value>` — Activity note
- `--done` — Mark the activity as done
- `--undone` — Mark the activity as not done
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli activity update 9 --subject "Renamed"
pdcli activity update 9 --done
pdcli activity update 9 --field "Outcome=Positive"
```

## pdcli auth

### `pdcli auth login`

Authenticate with Pipedrive (personal API token, or OAuth with --oauth)

```
pdcli auth login [flags]
```

- `--company <value>` — Company domain ("acme" from acme.pipedrive.com — full URL accepted)
- `--api-token <value>` — Personal API token (app.pipedrive.com/settings/api). Prefer the prompt or env so the token stays out of shell history
- `--oauth` — Use OAuth 2.0 via your own Developer Hub app (browser flow)
- `--client-id <value>` — OAuth app client ID (--oauth; env PDCLI_CLIENT_ID)
- `--client-secret <value>` — OAuth app client secret (--oauth; env PDCLI_CLIENT_SECRET)
- `--port <value>` — OAuth callback port — must match the app's registered callback URL (--oauth)

Examples:

```bash
pdcli auth login
pdcli auth login --company acme --api-token <token>
pdcli auth login --oauth
pdcli auth login --oauth --client-id <id> --client-secret <secret>
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

### `pdcli deal bulk-update`

Update many deals at once (by --ids, a saved --filter, or ids piped on stdin)

```
pdcli deal bulk-update [flags]
```

- `--ids <value>` — Comma-separated deal IDs
- `--filter <value>` — Pipedrive saved filter ID to select deals
- `--stage <value>` — Move to stage ID
- `--pipeline <value>` — Move to pipeline ID
- `--status <open|won|lost>` — Set status
- `--owner <value>` — Assign owner (user) ID
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)
- `--dry-run` — List the targets without updating anything
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli deal bulk-update --ids 1,2,3 --stage 5
pdcli deal bulk-update --filter 9 --status won
pdcli deal list --status open --jq '.[].id' | pdcli deal bulk-update --owner 42
pdcli deal bulk-update --filter 9 --stage 5 --dry-run
```

### `pdcli deal create`

Create a deal

```
pdcli deal create [flags]
```

- `--title <value>` _(required)_ — Deal title
- `--value <value>` — Deal value
- `--currency <value>` — Deal currency (e.g. EUR)
- `--status <open|won|lost>` — Deal status
- `--stage <value>` — Stage ID
- `--pipeline <value>` — Pipeline ID
- `--person <value>` — Linked person ID
- `--org <value>` — Linked organization ID
- `--owner <value>` — Owner (user) ID
- `--probability <value>` — Success probability (0-100)
- `--expected-close-date <value>` — Expected close date (YYYY-MM-DD)
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli deal create --title "Acme renewal" --value 5000 --currency EUR
pdcli deal create --title "Sized" --field "Deal Size=Large"
pdcli deal create --title "Raw" --body '{"probability":75}'
```

### `pdcli deal delete`

Delete a deal

```
pdcli deal delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli deal delete 42
pdcli deal delete 42 --yes
```

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

### `pdcli deal update`

Update a deal (v2 PATCH — only provided fields change)

```
pdcli deal update <id> [flags]
```

- `--title <value>` — Deal title
- `--value <value>` — Deal value
- `--currency <value>` — Deal currency (e.g. EUR)
- `--status <open|won|lost>` — Deal status
- `--stage <value>` — Stage ID
- `--pipeline <value>` — Pipeline ID
- `--person <value>` — Linked person ID
- `--org <value>` — Linked organization ID
- `--owner <value>` — Owner (user) ID
- `--probability <value>` — Success probability (0-100)
- `--expected-close-date <value>` — Expected close date (YYYY-MM-DD)
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli deal update 42 --stage 5
pdcli deal update 42 --status won
pdcli deal update 42 --field "Deal Size=Large"
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

## pdcli file

### `pdcli file download`

Download a file by ID

```
pdcli file download <id> [flags]
```

- `--out <value>` — Path to write to (default: file name)

Examples:

```bash
pdcli file download 5
pdcli file download 5 --out ./report.pdf
```

### `pdcli file get`

Get a file by ID

```
pdcli file get <id> [flags]
```

Examples:

```bash
pdcli file get 5
pdcli file get 5 --output json
```

### `pdcli file list`

List files

```
pdcli file list [flags]
```

Examples:

```bash
pdcli file list
pdcli file list --limit 50 --output json
```

### `pdcli file upload`

Upload a file

```
pdcli file upload <path> [flags]
```

- `--deal <value>` — Associate with a deal ID
- `--person <value>` — Associate with a person ID
- `--org <value>` — Associate with an organization ID

Examples:

```bash
pdcli file upload ./report.pdf
pdcli file upload ./report.pdf --deal 42
```

## pdcli filter

### `pdcli filter get`

Get a filter by ID

```
pdcli filter get <id> [flags]
```

Examples:

```bash
pdcli filter get 5
pdcli filter get 5 --output json
```

### `pdcli filter list`

List filters

```
pdcli filter list [flags]
```

- `--type <deals|leads|org|people|products|activity|projects>` — Filter by type

Examples:

```bash
pdcli filter list
pdcli filter list --type deals --output json
```

## pdcli goal

### `pdcli goal list`

List goals

```
pdcli goal list [flags]
```

- `--assignee <value>` — Filter by assignee (user) ID
- `--type <value>` — Filter by goal type name

Examples:

```bash
pdcli goal list
pdcli goal list --assignee 7 --type deals_won --output json
```

## pdcli lead

### `pdcli lead create`

Create a lead

```
pdcli lead create [flags]
```

- `--title <value>` _(required)_ — Lead title
- `--person <value>` — Linked person ID
- `--org <value>` — Linked organization ID
- `--owner <value>` — Owner (user) ID
- `--value <value>` — Lead value amount (requires --currency)
- `--currency <value>` — Lead value currency (requires --value)
- `--expected-close-date <value>` — Expected close date (YYYY-MM-DD)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli lead create --title "Acme renewal" --value 5000 --currency EUR
pdcli lead create --title "Linked" --person 4 --org 5
pdcli lead create --title "Raw" --body '{"visible_to":"3"}'
```

### `pdcli lead delete`

Delete a lead

```
pdcli lead delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli lead delete adf21080-0e10-11eb-879b-05d71fb426ec
pdcli lead delete adf21080-0e10-11eb-879b-05d71fb426ec --yes
```

### `pdcli lead get`

Get a lead by ID

```
pdcli lead get <id> [flags]
```

Examples:

```bash
pdcli lead get adf21080-0e10-11eb-879b-05d71fb426ec
pdcli lead get adf21080-0e10-11eb-879b-05d71fb426ec --output json
```

### `pdcli lead list`

List leads

```
pdcli lead list [flags]
```

- `--owner <value>` — Filter by owner (user) ID
- `--person <value>` — Filter by person ID
- `--org <value>` — Filter by organization ID

Examples:

```bash
pdcli lead list
pdcli lead list --owner 3 --output json
```

### `pdcli lead update`

Update a lead (v1 PATCH — only provided fields change)

```
pdcli lead update <id> [flags]
```

- `--title <value>` — Lead title
- `--person <value>` — Linked person ID
- `--org <value>` — Linked organization ID
- `--owner <value>` — Owner (user) ID
- `--value <value>` — Lead value amount (requires --currency)
- `--currency <value>` — Lead value currency (requires --value)
- `--expected-close-date <value>` — Expected close date (YYYY-MM-DD)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli lead update adf21080-0e10-11eb-879b-05d71fb426ec --title "Renamed"
pdcli lead update adf21080-0e10-11eb-879b-05d71fb426ec --value 7500 --currency USD
```

## pdcli metrics

### `pdcli metrics velocity`

Sales Velocity Equation: (open × win rate × avg won value) / cycle days

```
pdcli metrics velocity [flags]
```

- `--period <value>` — Trailing window for closed deals (Nd or Nm)
- `--pipeline <value>` — Restrict to a pipeline ID
- `--owner <value>` — Restrict to an owner (user) ID

Examples:

```bash
pdcli metrics velocity
pdcli metrics velocity --period 30d --pipeline 1
```

## pdcli note

### `pdcli note create`

Create a note

```
pdcli note create [flags]
```

- `--content <value>` _(required)_ — Note content
- `--deal <value>` — Attach to deal ID
- `--person <value>` — Attach to person ID
- `--org <value>` — Attach to organization ID
- `--lead <value>` — Attach to lead ID (UUID)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli note create --content "Called the lead"
pdcli note create --content "Follow up" --deal 42
pdcli note create --content "Pinned" --body '{"pinned_to_deal_flag":1}'
```

### `pdcli note delete`

Delete a note

```
pdcli note delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli note delete 5
pdcli note delete 5 --yes
```

### `pdcli note get`

Get a note by ID

```
pdcli note get <id> [flags]
```

Examples:

```bash
pdcli note get 5
pdcli note get 5 --output json
```

### `pdcli note list`

List notes

```
pdcli note list [flags]
```

- `--deal <value>` — Filter by deal ID
- `--person <value>` — Filter by person ID
- `--org <value>` — Filter by organization ID

Examples:

```bash
pdcli note list
pdcli note list --deal 42 --output json
```

### `pdcli note update`

Update a note (only provided fields change)

```
pdcli note update <id> [flags]
```

- `--content <value>` — Note content
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli note update 5 --content "Revised note"
pdcli note update 5 --body '{"pinned_to_deal_flag":1}'
```

## pdcli org

### `pdcli org create`

Create an organization

```
pdcli org create [flags]
```

- `--name <value>` _(required)_ — Organization name
- `--owner <value>` — Owner (user) ID
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli org create --name "Acme Corp"
pdcli org create --name "Tiered" --field "Tier=Gold"
pdcli org create --name "Raw" --body '{"visible_to":3}'
```

### `pdcli org delete`

Delete an organization

```
pdcli org delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli org delete 7
pdcli org delete 7 --yes
```

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

### `pdcli org import`

Bulk-create organizations from a CSV (headers map to fields, custom fields by name)

```
pdcli org import <file> [flags]
```

- `--dry-run` — Validate every row without creating anything
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli org import orgs.csv
pdcli org import orgs.csv --dry-run
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

### `pdcli org update`

Update an organization (v2 PATCH — only provided fields change)

```
pdcli org update <id> [flags]
```

- `--name <value>` — Organization name
- `--owner <value>` — Owner (user) ID
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli org update 7 --name "Acme Inc"
pdcli org update 7 --owner 9
pdcli org update 7 --field "Tier=Gold"
```

## pdcli person

### `pdcli person create`

Create a person

```
pdcli person create [flags]
```

- `--name <value>` _(required)_ — Person name
- `--email <value>` — Email address (repeatable; first is primary)
- `--phone <value>` — Phone number (repeatable; first is primary)
- `--org <value>` — Linked organization ID
- `--owner <value>` — Owner (user) ID
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli person create --name "Jane Doe" --email jane@acme.com
pdcli person create --name "Jane" --field "Segment=Enterprise"
pdcli person create --name "Raw" --body '{"visible_to":"3"}'
```

### `pdcli person delete`

Delete a person

```
pdcli person delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli person delete 42
pdcli person delete 42 --yes
```

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

### `pdcli person import`

Bulk-create persons from a CSV (headers map to fields, custom fields by name)

```
pdcli person import <file> [flags]
```

- `--dry-run` — Validate every row without creating anything
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli person import people.csv
pdcli person import people.csv --dry-run
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

### `pdcli person update`

Update a person (v2 PATCH — only provided fields change)

```
pdcli person update <id> [flags]
```

- `--name <value>` — Person name
- `--email <value>` — Email address (repeatable; first is primary)
- `--phone <value>` — Phone number (repeatable; first is primary)
- `--org <value>` — Linked organization ID
- `--owner <value>` — Owner (user) ID
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli person update 42 --name "New name"
pdcli person update 42 --email new@acme.com
pdcli person update 42 --field "Segment=Enterprise"
```

## pdcli pipeline

### `pdcli pipeline get`

Get a pipeline by ID

```
pdcli pipeline get <id> [flags]
```

Examples:

```bash
pdcli pipeline get 1
pdcli pipeline get 1 --output json
```

### `pdcli pipeline health`

Per-stage pipeline health: value, weighted value, stale deals, missing next steps

```
pdcli pipeline health [flags]
```

- `--pipeline <value>` — Pipeline ID (required when the account has several)

Examples:

```bash
pdcli pipeline health
pdcli pipeline health --pipeline 1
```

### `pdcli pipeline list`

List pipelines

```
pdcli pipeline list [flags]
```

Examples:

```bash
pdcli pipeline list
pdcli pipeline list --output json
```

## pdcli product

### `pdcli product create`

Create a product

```
pdcli product create [flags]
```

- `--name <value>` _(required)_ — Product name
- `--code <value>` — Product code (SKU)
- `--unit <value>` — Unit of measure
- `--description <value>` — Product description
- `--owner <value>` — Owner (user) ID
- `--price <value>` — Unit price (requires --currency)
- `--currency <value>` — Price currency (requires --price)
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli product create --name "Widget" --code W-1 --price 9.99 --currency EUR
pdcli product create --name "Sized" --field "Material=Steel"
pdcli product create --name "Raw" --body '{"tax":19}'
```

### `pdcli product delete`

Delete a product

```
pdcli product delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli product delete 7
pdcli product delete 7 --yes
```

### `pdcli product get`

Get a product by ID

```
pdcli product get <id> [flags]
```

Examples:

```bash
pdcli product get 7
pdcli product get 7 --output json
```

### `pdcli product list`

List products

```
pdcli product list [flags]
```

- `--owner <value>` — Filter by owner (user) ID

Examples:

```bash
pdcli product list
pdcli product list --owner 3 --output json
```

### `pdcli product update`

Update a product (v2 PATCH — only provided fields change)

```
pdcli product update <id> [flags]
```

- `--name <value>` — Product name
- `--code <value>` — Product code (SKU)
- `--unit <value>` — Unit of measure
- `--description <value>` — Product description
- `--owner <value>` — Owner (user) ID
- `--price <value>` — Unit price (requires --currency)
- `--currency <value>` — Price currency (requires --price)
- `--field <value>` — Custom/standard field as "Name=Value" (repeatable)
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli product update 7 --name "New name"
pdcli product update 7 --price 12.50 --currency USD
pdcli product update 7 --field "Material=Steel"
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

## pdcli project

### `pdcli project create`

Create a project

```
pdcli project create [flags]
```

- `--title <value>` _(required)_ — Project title
- `--description <value>` — Project description
- `--status <value>` — Project status
- `--start-date <value>` — Start date (YYYY-MM-DD)
- `--end-date <value>` — End date (YYYY-MM-DD)
- `--owner <value>` — Owner (user) ID
- `--board <value>` — Board ID
- `--phase <value>` — Phase ID
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli project create --title "Launch"
pdcli project create --title "Launch" --owner 3 --status open
pdcli project create --title "Raw" --body '{"deal_ids":[1,2]}'
```

### `pdcli project delete`

Delete a project

```
pdcli project delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli project delete 7
pdcli project delete 7 --yes
```

### `pdcli project get`

Get a project by ID

```
pdcli project get <id> [flags]
```

Examples:

```bash
pdcli project get 3
pdcli project get 3 --output json
```

### `pdcli project list`

List projects

```
pdcli project list [flags]
```

Examples:

```bash
pdcli project list
pdcli project list --output json
```

### `pdcli project update`

Update a project (v2 PATCH — only provided fields change)

```
pdcli project update <id> [flags]
```

- `--title <value>` — Project title
- `--description <value>` — Project description
- `--status <value>` — Project status
- `--start-date <value>` — Start date (YYYY-MM-DD)
- `--end-date <value>` — End date (YYYY-MM-DD)
- `--owner <value>` — Owner (user) ID
- `--board <value>` — Board ID
- `--phase <value>` — Phase ID
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli project update 7 --title "Relaunch"
pdcli project update 7 --status closed
pdcli project update 7 --owner 9
```

## pdcli stage

### `pdcli stage get`

Get a stage by ID

```
pdcli stage get <id> [flags]
```

Examples:

```bash
pdcli stage get 5
pdcli stage get 5 --output json
```

### `pdcli stage list`

List stages

```
pdcli stage list [flags]
```

- `--pipeline <value>` — Filter by pipeline ID

Examples:

```bash
pdcli stage list
pdcli stage list --pipeline 1 --output json
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

## pdcli webhook

### `pdcli webhook create`

Create a webhook

```
pdcli webhook create [flags]
```

- `--url <value>` _(required)_ — Webhook subscription URL
- `--event-action <create|change|delete|*>` _(required)_ — Event action to subscribe to
- `--event-object <activity|deal|lead|note|organization|person|product|user|pipeline|stage|*>` _(required)_ — Event object to subscribe to
- `--name <value>` — Webhook name
- `--version <value>` — Webhook payload version
- `--http-auth-user <value>` — HTTP basic auth username for the endpoint
- `--http-auth-password <value>` — HTTP basic auth password for the endpoint

Examples:

```bash
pdcli webhook create --url https://example.com/hook --event-action change --event-object deal
pdcli webhook create --url https://example.com/hook --event-action "*" --event-object "*"
```

### `pdcli webhook delete`

Delete a webhook

```
pdcli webhook delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli webhook delete 3
pdcli webhook delete 3 --yes
```

### `pdcli webhook list`

List webhooks

```
pdcli webhook list [flags]
```

Examples:

```bash
pdcli webhook list
pdcli webhook list --output json
```

