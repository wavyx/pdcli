---
title: Commands
description: Full command reference for the pdcli command-line interface.
---

<!-- AUTO-GENERATED from the oclif manifest by scripts/gen-commands.mjs — do not edit by hand. -->

Reference for `pdcli` v0.12.0 (134 commands). Every command also accepts the global flags `--output table|json|yaml|csv`, `--profile`, `--no-color`, `--verbose`, `--no-retry`, `--timeout`, and `--limit`.

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
- `--exact` — Mine real stage transitions from each deal’s changelog instead of approximating from the final stage (one request per deal). --period scopes only closed (won/lost) deals; open deals are always included.

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
- `--status <open|won|lost>` — Filter by deal status (only with --item-types deal)
- `--person <value>` — Filter by person ID (only with --item-types deal)
- `--org <value>` — Filter by organization ID (only with --item-types deal)

Examples:

```bash
pdcli search "acme"
pdcli search "acme" --item-types deal,person --output json
pdcli search "acme" --item-types deal --status open
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
- `--type <value>` — Filter by activity type key (applied client-side)
- `--done` — Only completed activities
- `--todo` — Only open (not done) activities
- `--filter <value>` — Filter by saved filter ID
- `--ids <value>` — Comma-separated IDs to fetch (max 100)
- `--sort-by <id|update_time|add_time|due_date>` — Sort field
- `--sort-direction <asc|desc>` — Sort direction
- `--updated-since <value>` — Only items updated at/after this RFC3339 time (no fractional seconds)
- `--updated-until <value>` — Only items updated before this RFC3339 time (no fractional seconds)

Examples:

```bash
pdcli activity list
pdcli activity list --todo --deal 42
pdcli activity list --type call --output json
```

### `pdcli activity type list`

List activity types. The Key (key_string) is what `activity --type` takes.

```
pdcli activity type list [flags]
```

Examples:

```bash
pdcli activity type list
pdcli activity type list --output json
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

## pdcli alias

### `pdcli alias list`

List all configured aliases

```
pdcli alias list [flags]
```

Examples:

```bash
pdcli alias list
```

### `pdcli alias set`

Create or update an alias

```
pdcli alias set <name> <command> [flags]
```

Examples:

```bash
pdcli alias set wd "deal list --status won"
pdcli alias set open "deal list --status open --limit 50"
```

### `pdcli alias unset`

Remove an alias

```
pdcli alias unset <name> [flags]
```

Examples:

```bash
pdcli alias unset wd
```

## pdcli audit

### `pdcli audit stage-skips`

Stage-skip & sandbagging audit: deals that jumped gates or were pulled backward, mined from each deal’s changelog (one request per deal)

```
pdcli audit stage-skips [flags]
```

- `--pipeline <value>` — Pipeline ID (required when the account has several)

Examples:

```bash
pdcli audit stage-skips
pdcli audit stage-skips --pipeline 1 --output json
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

### `pdcli config unset`

Remove a config key from the active profile

```
pdcli config unset <key> [flags]
```

Examples:

```bash
pdcli config unset default_output
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

### `pdcli deal convert`

Convert a deal to a lead. The conversion runs as an async job; use --wait to poll until it finishes. WARNING: on success the source deal is deleted.

```
pdcli deal convert <id> [flags]
```

- `--wait` — Poll the conversion status until it finishes
- `--timeout-secs <value>` — Max seconds to poll when --wait is set
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli deal convert 42
pdcli deal convert 42 --yes
pdcli deal convert 42 --wait
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

### `pdcli deal follower add`

Add a follower (user) to a deal

```
pdcli deal follower add <id> [flags]
```

- `--user <value>` _(required)_ — User ID

Examples:

```bash
pdcli deal follower add 42 --user 5
pdcli deal follower add 42 --user 5 --output json
```

### `pdcli deal follower list`

List followers of a deal

```
pdcli deal follower list <id> [flags]
```

Examples:

```bash
pdcli deal follower list 42
pdcli deal follower list 42 --output json
```

### `pdcli deal follower remove`

Remove a follower from a deal

```
pdcli deal follower remove <id> [flags]
```

- `--user <value>` _(required)_ — User ID
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli deal follower remove 42 --user 5
pdcli deal follower remove 42 --user 5 --yes
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

### `pdcli deal history`

Field-change history for a deal, newest-first (the API’s native order)

```
pdcli deal history <id> [flags]
```

- `--field <value>` — Show only changes to this field key (e.g. stage_id)

Examples:

```bash
pdcli deal history 42
pdcli deal history 42 --field stage_id
pdcli deal history 42 --limit 20 --resolve-fields
```

### `pdcli deal list`

List deals

```
pdcli deal list [flags]
```

- `--archived` — List archived deals instead of active ones
- `--status <open|won|lost|deleted>` — Filter by status
- `--stage <value>` — Filter by stage ID
- `--pipeline <value>` — Filter by pipeline ID
- `--owner <value>` — Filter by owner (user) ID
- `--person <value>` — Filter by person ID
- `--org <value>` — Filter by organization ID
- `--filter <value>` — Filter by saved filter ID
- `--ids <value>` — Comma-separated IDs to fetch (max 100)
- `--sort-by <id|update_time|add_time>` — Sort field
- `--sort-direction <asc|desc>` — Sort direction
- `--updated-since <value>` — Only items updated at/after this RFC3339 time (no fractional seconds)
- `--updated-until <value>` — Only items updated before this RFC3339 time (no fractional seconds)

Examples:

```bash
pdcli deal list
pdcli deal list --status won --limit 50
pdcli deal list --stage 3 --output json
```

### `pdcli deal participant add`

Add a participant (person) to a deal

```
pdcli deal participant add <id> [flags]
```

- `--person <value>` _(required)_ — Person ID

Examples:

```bash
pdcli deal participant add 42 --person 10
pdcli deal participant add 42 --person 10 --output json
```

### `pdcli deal participant list`

List participants of a deal

```
pdcli deal participant list <id> [flags]
```

Examples:

```bash
pdcli deal participant list 42
pdcli deal participant list 42 --output json
```

### `pdcli deal participant remove`

Remove a participant from a deal

```
pdcli deal participant remove <id> [flags]
```

- `--participant <value>` _(required)_ — Deal-participant ID
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli deal participant remove 42 --participant 3
pdcli deal participant remove 42 --participant 3 --yes
```

### `pdcli deal product add`

Attach a product to a deal

```
pdcli deal product add <id> [flags]
```

- `--product <value>` _(required)_ — Product ID
- `--price <value>` _(required)_ — Item price (per unit)
- `--quantity <value>` — Quantity
- `--discount <value>` — Discount value
- `--discount-type <percentage|amount>` — Discount type
- `--tax <value>` — Product tax percentage
- `--comments <value>` — Comments

Examples:

```bash
pdcli deal product add 42 --product 10 --price 90
pdcli deal product add 42 --product 10 --price 90 --quantity 3
pdcli deal product add 42 --product 10 --price 90 --discount 10 --discount-type percentage
```

### `pdcli deal product list`

List products attached to a deal

```
pdcli deal product list <id> [flags]
```

- `--sort-by <id|add_time|update_time|order_nr>` — Field to sort by
- `--sort-direction <asc|desc>` — Sort direction

Examples:

```bash
pdcli deal product list 42
pdcli deal product list 42 --sort-by add_time --sort-direction desc
pdcli deal product list 42 --output json
```

### `pdcli deal product remove`

Remove a product attached to a deal

```
pdcli deal product remove <id> [flags]
```

- `--attachment <value>` _(required)_ — Deal-product (attachment) ID
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli deal product remove 42 --attachment 3
pdcli deal product remove 42 --attachment 3 --yes
```

### `pdcli deal product update`

Update a product attached to a deal (v2 PATCH — only provided fields change)

```
pdcli deal product update <id> [flags]
```

- `--attachment <value>` _(required)_ — Deal-product (attachment) ID
- `--product <value>` — Product ID
- `--price <value>` — Item price (per unit)
- `--quantity <value>` — Quantity
- `--discount <value>` — Discount value
- `--discount-type <percentage|amount>` — Discount type
- `--tax <value>` — Product tax percentage
- `--comments <value>` — Comments

Examples:

```bash
pdcli deal product update 42 --attachment 3 --quantity 5
pdcli deal product update 42 --attachment 3 --price 120
pdcli deal product update 42 --attachment 3 --discount 15 --discount-type amount
```

### `pdcli deal summary`

Summary of open/won/lost deals, totalled per currency

```
pdcli deal summary [flags]
```

- `--status <open|won|lost>` — Filter by status
- `--pipeline <value>` — Filter by pipeline ID
- `--stage <value>` — Filter by stage ID
- `--filter <value>` — Filter by saved filter ID

Examples:

```bash
pdcli deal summary
pdcli deal summary --status open --pipeline 1
pdcli deal summary --output json
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

### `pdcli field create`

Create a custom field on an entity

```
pdcli field create <entity> [flags]
```

- `--name <value>` _(required)_ — Field name (label)
- `--type <value>` _(required)_ — Field type (e.g. varchar, double, monetary, enum, set)
- `--options <value>` — Comma-separated option labels (required for enum/set)

Examples:

```bash
pdcli field create deal --name "Budget" --type double
pdcli field create person --name "Tier" --type enum --options "Gold,Silver,Bronze"
```

### `pdcli field delete`

Delete a custom field (data stored on records is lost)

```
pdcli field delete <entity> <field> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli field delete deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12
pdcli field delete deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12 --yes
```

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

### `pdcli field option add`

Add an option to an enum/set custom field

```
pdcli field option add <entity> <field> [flags]
```

- `--label <value>` _(required)_ — Label for the new option

Examples:

```bash
pdcli field option add deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12 --label "Critical"
```

### `pdcli field option remove`

Remove an option from an enum/set custom field (records lose the value)

```
pdcli field option remove <entity> <field> [flags]
```

- `--option <value>` _(required)_ — Option ID to remove (see field get)
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli field option remove deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12 --option 4
```

### `pdcli field update`

Update a custom field (field_code and field_type cannot change)

```
pdcli field update <entity> <field> [flags]
```

- `--name <value>` _(required)_ — New field name (label)

Examples:

```bash
pdcli field update deal dcf558aac1ae4e8c4f849ba5e668430d8df9be12 --name "New name"
```

## pdcli file

### `pdcli file delete`

Delete a file

```
pdcli file delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli file delete 5
pdcli file delete 5 --yes
```

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

### `pdcli file remote-link`

Link an existing remote file (Google Drive) to an item

```
pdcli file remote-link [flags]
```

- `--deal <value>` — Link to a deal ID
- `--org <value>` — Link to an organization ID
- `--person <value>` — Link to a person ID
- `--remote-id <value>` _(required)_ — ID of the remote file (e.g. Google Drive file ID)
- `--remote-location <googledrive>` — Remote storage location

Examples:

```bash
pdcli file remote-link --deal 42 --remote-id 1AbC
pdcli file remote-link --person 9 --remote-id 1AbC --output json
```

### `pdcli file update`

Update a file name and/or description

```
pdcli file update <id> [flags]
```

- `--name <value>` — The visible name of the file
- `--description <value>` — The description of the file

Examples:

```bash
pdcli file update 5 --name report.pdf
pdcli file update 5 --description "Signed contract"
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

### `pdcli filter delete`

Delete a filter

```
pdcli filter delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli filter delete 5
pdcli filter delete 5 --yes
```

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

### `pdcli lead convert`

Convert a lead to a deal. The conversion runs as an async job; use --wait to poll until it finishes. On success the lead is deleted.

```
pdcli lead convert <id> [flags]
```

- `--stage <value>` — Stage ID for the new deal (a pipeline is inferred from it)
- `--pipeline <value>` — Pipeline ID for the new deal (ignored when --stage is set)
- `--wait` — Poll the conversion status until it finishes
- `--timeout-secs <value>` — Max seconds to poll when --wait is set

Examples:

```bash
pdcli lead convert adf21080-0e10-11eb-879b-05d71fb426ec
pdcli lead convert adf21080-0e10-11eb-879b-05d71fb426ec --stage 7
pdcli lead convert adf21080-0e10-11eb-879b-05d71fb426ec --wait
```

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

### `pdcli lead label list`

List lead labels

```
pdcli lead label list [flags]
```

Examples:

```bash
pdcli lead label list
pdcli lead label list --output json
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

### `pdcli metrics aging`

Deal aging: days-in-current-stage per open deal, bucketed, with a p90-dwell flag (mines each open deal’s changelog, one request per deal)

```
pdcli metrics aging [flags]
```

- `--pipeline <value>` — Pipeline ID (required when the account has several)
- `--buckets <value>` — Comma-separated day thresholds; cohorts are 0-N1/N1-N2/.../last+ (lower bound inclusive, upper exclusive)

Examples:

```bash
pdcli metrics aging
pdcli metrics aging --pipeline 1 --buckets 30,60,90
```

### `pdcli metrics conversion-matrix`

Stage-transition matrix: every stage move (incl. backward & re-entry) mined from per-deal changelogs, with Won/Lost terminal columns

```
pdcli metrics conversion-matrix [flags]
```

- `--pipeline <value>` — Pipeline ID (required when the account has several)

Examples:

```bash
pdcli metrics conversion-matrix
pdcli metrics conversion-matrix --pipeline 1 --output json
```

### `pdcli metrics coverage`

Pipeline coverage: probability-weighted open pipeline vs the revenue still needed to hit quota

```
pdcli metrics coverage [flags]
```

- `--pipeline <value>` — Pipeline ID (required when the account has several)
- `--period <value>` — Goal measurement window (Nd or Nm)
- `--target <value>` — Manual revenue quota override (skips the Goals API entirely)

Examples:

```bash
pdcli metrics coverage
pdcli metrics coverage --pipeline 1
pdcli metrics coverage --target 250000
pdcli metrics coverage --period 1m --output json
```

### `pdcli metrics slippage`

Close-date slippage: open deals whose expected close date keeps getting pushed out (mined per-deal changelog)

```
pdcli metrics slippage [flags]
```

- `--pipeline <value>` — Pipeline ID (required when the account has several)
- `--min-pushes <value>` — Only show deals pushed forward at least this many times

Examples:

```bash
pdcli metrics slippage
pdcli metrics slippage --pipeline 1
pdcli metrics slippage --min-pushes 2 --output json
```

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

### `pdcli note comment add`

Add a comment to a note

```
pdcli note comment add <noteId> [flags]
```

- `--content <value>` _(required)_ — Comment content

Examples:

```bash
pdcli note comment add 5 --content "Nice work"
pdcli note comment add 5 --content "Reviewed" --output json
```

### `pdcli note comment delete`

Delete a comment from a note

```
pdcli note comment delete <noteId> [flags]
```

- `--comment <value>` _(required)_ — Comment ID (UUID)
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli note comment delete 5 --comment <uuid>
pdcli note comment delete 5 --comment <uuid> --yes
```

### `pdcli note comment list`

List comments on a note

```
pdcli note comment list <noteId> [flags]
```

Examples:

```bash
pdcli note comment list 5
pdcli note comment list 5 --output json
```

### `pdcli note comment update`

Update a comment on a note

```
pdcli note comment update <noteId> [flags]
```

- `--comment <value>` _(required)_ — Comment ID (UUID)
- `--content <value>` _(required)_ — New comment content

Examples:

```bash
pdcli note comment update 5 --comment <uuid> --content "Edited"
```

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

### `pdcli org follower add`

Add a follower (user) to an organization

```
pdcli org follower add <id> [flags]
```

- `--user <value>` _(required)_ — User ID

Examples:

```bash
pdcli org follower add 42 --user 5
pdcli org follower add 42 --user 5 --output json
```

### `pdcli org follower list`

List followers of an organization

```
pdcli org follower list <id> [flags]
```

Examples:

```bash
pdcli org follower list 42
pdcli org follower list 42 --output json
```

### `pdcli org follower remove`

Remove a follower from an organization

```
pdcli org follower remove <id> [flags]
```

- `--user <value>` _(required)_ — User ID
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli org follower remove 42 --user 5
pdcli org follower remove 42 --user 5 --yes
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
- `--filter <value>` — Filter by saved filter ID
- `--ids <value>` — Comma-separated IDs to fetch (max 100)
- `--sort-by <id|update_time|add_time>` — Sort field
- `--sort-direction <asc|desc>` — Sort direction
- `--updated-since <value>` — Only items updated at/after this RFC3339 time (no fractional seconds)
- `--updated-until <value>` — Only items updated before this RFC3339 time (no fractional seconds)

Examples:

```bash
pdcli org list
pdcli org list --owner 3 --output json
```

### `pdcli org merge`

Merge one organization into another. WARNING: the positional <id> is the LOSING record — Pipedrive deletes it. --into is the surviving record whose data wins on conflict. All related data (deals, activities, notes, files) is transferred to the survivor.

```
pdcli org merge <id> [flags]
```

- `--into <value>` _(required)_ — ID of the surviving organization to keep (the winner)
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli org merge 123 --into 456
pdcli org merge 123 --into 456 --yes
```

### `pdcli org relationship add`

Create an organization relationship. For a parent relationship the --owner organization is the parent and --linked is the daughter.

```
pdcli org relationship add [flags]
```

- `--type <parent|related>` _(required)_ — Relationship type
- `--owner <value>` _(required)_ — Owner organization ID (the parent for type parent)
- `--linked <value>` _(required)_ — Linked organization ID (the daughter for type parent)

Examples:

```bash
pdcli org relationship add --type parent --owner 1481 --linked 1480
pdcli org relationship add --type related --owner 1 --linked 2
```

### `pdcli org relationship list`

List relationships for an organization

```
pdcli org relationship list [flags]
```

- `--org <value>` _(required)_ — Organization ID to list relationships for

Examples:

```bash
pdcli org relationship list --org 1481
pdcli org relationship list --org 1481 --output json
```

### `pdcli org relationship remove`

Delete an organization relationship

```
pdcli org relationship remove <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli org relationship remove 7
pdcli org relationship remove 7 --yes
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

### `pdcli person follower add`

Add a follower (user) to a person

```
pdcli person follower add <id> [flags]
```

- `--user <value>` _(required)_ — User ID

Examples:

```bash
pdcli person follower add 42 --user 5
pdcli person follower add 42 --user 5 --output json
```

### `pdcli person follower list`

List followers of a person

```
pdcli person follower list <id> [flags]
```

Examples:

```bash
pdcli person follower list 42
pdcli person follower list 42 --output json
```

### `pdcli person follower remove`

Remove a follower from a person

```
pdcli person follower remove <id> [flags]
```

- `--user <value>` _(required)_ — User ID
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli person follower remove 42 --user 5
pdcli person follower remove 42 --user 5 --yes
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
- `--filter <value>` — Filter by saved filter ID
- `--ids <value>` — Comma-separated IDs to fetch (max 100)
- `--sort-by <id|update_time|add_time>` — Sort field
- `--sort-direction <asc|desc>` — Sort direction
- `--updated-since <value>` — Only items updated at/after this RFC3339 time (no fractional seconds)
- `--updated-until <value>` — Only items updated before this RFC3339 time (no fractional seconds)

Examples:

```bash
pdcli person list
pdcli person list --org 7 --output json
```

### `pdcli person merge`

Merge one person into another. WARNING: the positional <id> is the LOSING record — Pipedrive deletes it. --into is the surviving record whose data wins on conflict. All related data (deals, activities, notes, files) is transferred to the survivor.

```
pdcli person merge <id> [flags]
```

- `--into <value>` _(required)_ — ID of the surviving person to keep (the winner)
- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli person merge 123 --into 456
pdcli person merge 123 --into 456 --yes
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
- `--filter <value>` — Filter by saved filter ID
- `--ids <value>` — Comma-separated IDs to fetch (max 100)
- `--sort-by <id|name|add_time|update_time>` — Sort field
- `--sort-direction <asc|desc>` — Sort direction
- `--updated-since <value>` — Only items updated at/after this RFC3339 time (no fractional seconds)

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

- `--archived` — List archived projects instead of active ones

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

## pdcli task

### `pdcli task create`

Create a task

```
pdcli task create [flags]
```

- `--title <value>` _(required)_ — Task title
- `--project <value>` _(required)_ — Project ID
- `--description <value>` — Task description
- `--assignee <value>` — Assignee (user) ID
- `--due-date <value>` — Due date (YYYY-MM-DD)
- `--parent <value>` — Parent task ID
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli task create --title "Write spec" --project 3
pdcli task create --title "Subtask" --project 3 --parent 5 --assignee 7
pdcli task create --title "Raw" --project 3 --body '{"priority":5}'
```

### `pdcli task delete`

Delete a task

```
pdcli task delete <id> [flags]
```

- `-y, --yes` — Skip the confirmation prompt

Examples:

```bash
pdcli task delete 7
pdcli task delete 7 --yes
```

### `pdcli task get`

Get a task by ID

```
pdcli task get <id> [flags]
```

Examples:

```bash
pdcli task get 9
pdcli task get 9 --output json
```

### `pdcli task list`

List tasks

```
pdcli task list [flags]
```

- `--project <value>` — Filter by project ID
- `--assignee <value>` — Filter by assignee (user) ID
- `--parent <value>` — Filter by parent task ID
- `--done` — Only completed tasks
- `--todo` — Only open (not done) tasks

Examples:

```bash
pdcli task list
pdcli task list --project 3 --todo
pdcli task list --assignee 7 --output json
```

### `pdcli task update`

Update a task (v2 PATCH — only provided fields change)

```
pdcli task update <id> [flags]
```

- `--title <value>` — Task title
- `--project <value>` — Project ID
- `--description <value>` — Task description
- `--assignee <value>` — Assignee (user) ID
- `--due-date <value>` — Due date (YYYY-MM-DD)
- `--parent <value>` — Parent task ID
- `--done` — Mark the task as done
- `--undone` — Mark the task as not done
- `--body <value>` — Raw JSON body to merge (flags win)

Examples:

```bash
pdcli task update 7 --title "Renamed"
pdcli task update 7 --done
pdcli task update 7 --assignee 9
```

## pdcli user

### `pdcli user find`

Find users by name

```
pdcli user find <term> [flags]
```

- `--by-email` — Match the term against email addresses only

Examples:

```bash
pdcli user find "jane"
pdcli user find "jane@acme.com" --by-email --output json
```

### `pdcli user list`

List all users

```
pdcli user list [flags]
```

Examples:

```bash
pdcli user list
pdcli user list --output json
```

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
- `--event-object <activity|board|deal|deal_installment|deal_product|lead|note|organization|person|phase|pipeline|product|project|stage|task|user|*>` _(required)_ — Event object to subscribe to
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

