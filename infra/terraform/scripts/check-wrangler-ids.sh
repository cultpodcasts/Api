#!/usr/bin/env bash
# Fail before any migration or deploy if wrangler.search.jsonc binds a database id other than
# the one this stack's Terraform manages (SP-1.10 #270, SP-1.11 #273). Fix with a PR running
# infra/terraform/scripts/sync-wrangler-ids.mjs (ids are not secrets).
#
# Usage: check-wrangler-ids.sh <terraform-output.json> [wrangler.search.jsonc]
set -euo pipefail
outputs="${1:?usage: check-wrangler-ids.sh <terraform-output.json> [wrangler.search.jsonc]}"
config="${2:-wrangler.search.jsonc}"
scratch="$(mktemp)"
trap 'rm -f "$scratch"' EXIT
cp "$config" "$scratch"
node "$(dirname "$0")/sync-wrangler-ids.mjs" "$outputs" --config "$scratch"
if cmp -s "$config" "$scratch"; then
  echo "$config matches the Terraform database id."
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$config matches the Terraform database id." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
echo "::error title=wrangler.search.jsonc::Database id differs from Terraform outputs. The search Worker would be bound to a database Terraform does not manage. Investigate, then sync with infra/terraform/scripts/sync-wrangler-ids.mjs in a PR."
diff "$config" "$scratch" || true
exit 1
