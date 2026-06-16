#!/usr/bin/env bash
#
# seed-demo.sh — build a clean, realistic demo pipeline in your Pipedrive
# SANDBOX so the README recording (docs/demo.tape → docs/demo.gif/webp) looks
# polished instead of reflecting whatever junk a shared sandbox accumulated.
#
# It creates:
#   - a "pdcli demo" pipeline with 4 stages (rising win probabilities)
#   - 10 open deals with sane €values (per-stage totals mirror the hero frames)
#   - 1 stale deal (old expected close) and a duplicate person, so `pdcli audit`
#     has genuine findings to show
# then rewrites the `--pipeline N` ids in docs/demo.tape to the new pipeline.
#
# Requires `pdcli` on PATH and an authenticated profile (use a SANDBOX, not
# production — this writes data). Run once, then `npm run docs:demo`.
#
#   pdcli auth login            # or: export PDCLI_COMPANY_DOMAIN / PDCLI_API_TOKEN
#   ./scripts/seed-demo.sh
#
# Everything lands in the new pipeline, so cleanup is just deleting it.

set -euo pipefail

command -v pdcli >/dev/null || { echo "pdcli not on PATH (npm i -g @wavyx/pdcli)"; exit 1; }
pdcli api GET /api/v1/users/me >/dev/null 2>&1 || { echo "Not authenticated — run 'pdcli auth login' or set PDCLI_* env vars."; exit 1; }

# Read `.data.id` from a raw `pdcli api` JSON response on stdin.
id() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).data.id)))'; }

echo "Creating the 'pdcli demo' pipeline…"
PID=$(pdcli api POST /api/v1/pipelines --body '{"name":"pdcli demo"}' | id)

echo "Creating stages…"
S1=$(pdcli api POST /api/v1/stages --body "{\"name\":\"Qualified\",\"pipeline_id\":$PID,\"deal_probability\":20}" | id)
S2=$(pdcli api POST /api/v1/stages --body "{\"name\":\"Contact\",\"pipeline_id\":$PID,\"deal_probability\":40}" | id)
S3=$(pdcli api POST /api/v1/stages --body "{\"name\":\"Proposal\",\"pipeline_id\":$PID,\"deal_probability\":60}" | id)
S4=$(pdcli api POST /api/v1/stages --body "{\"name\":\"Negotiation\",\"pipeline_id\":$PID,\"deal_probability\":80}" | id)

# title|value|stage — per-stage totals: 142k / 98.5k / 76.2k / 51k
deal() {
  pdcli api POST /api/v2/deals \
    --body "{\"title\":\"$1\",\"value\":$2,\"currency\":\"EUR\",\"pipeline_id\":$PID,\"stage_id\":$3}" >/dev/null
}

echo "Creating deals…"
deal "Initech onboarding"  60000 "$S1"
deal "Umbrella pilot"      50000 "$S1"
deal "Soylent trial"       32000 "$S1"
deal "Hooli migration"     40000 "$S2"
deal "Stark upgrade"       38500 "$S2"
deal "Wayne add-on"        20000 "$S2"
deal "Acme renewal"        50000 "$S3"
deal "Globex expansion"    26200 "$S3"
deal "Wonka enterprise"    30000 "$S4"
deal "Cyberdyne seats"     21000 "$S4"

# A long-stalled deal (old expected close, no activity) → stale-deal / next-step findings.
pdcli api POST /api/v2/deals \
  --body "{\"title\":\"Vandelay (stalled)\",\"value\":15000,\"currency\":\"EUR\",\"pipeline_id\":$PID,\"stage_id\":$S1,\"expected_close_date\":\"2024-01-01\"}" >/dev/null

# Two persons sharing an email → duplicate-persons finding.
echo "Creating a duplicate person for the audit scene…"
for _ in 1 2; do
  pdcli api POST /api/v2/persons \
    --body '{"name":"Dana Demo","emails":[{"value":"dana@demo.example","primary":true}]}' >/dev/null
done

# Point the recording at the new pipeline.
sed -i '' -E "s/--pipeline [0-9]+/--pipeline $PID/g" docs/demo.tape

echo
echo "Done. Demo pipeline id = $PID (docs/demo.tape updated)."
echo "Record it:  npm run docs:demo"
echo "Clean up later:  pdcli api DELETE /api/v1/pipelines/$PID  (deals go with it)"
