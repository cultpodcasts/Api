#!/usr/bin/env bash
# Build the wrangler config the search deploy job uses, with this stack's Terraform database id,
# and compare it with the committed wrangler.search.jsonc (SP-1.10 #270, SP-1.11 #273, #279).
#
# Option 3 (Jon, #279): a rebuilt stack's D1 database has a NEW id, and CI must still deploy it
# without a hand-made PR. So the job never deploys from the committed file: it copies it to
# <deploy-config>, writes the Terraform-output id into the copy (sync-wrangler-ids.mjs, which
# leaves `local-` ids alone), and runs the D1 migrations and `wrangler deploy` against the copy.
# The committed file is never written. A differing committed id is a WARNING, not a failure;
# the workflow then opens (or updates) the id sync PR (open-id-sync-pr.sh).
#
# <deploy-config> must sit next to the committed config: wrangler resolves `main`,
# `migrations_dir` and `$schema` relative to the config file. It is gitignored.
#
# Writes to $GITHUB_OUTPUT (when set): ids_match=true|false, database_name, database_id.
# Exit 0 = deploy config written (ids match or not), 1 = error (bad outputs, missing binding).
#
# Usage: prepare-deploy-config.sh <terraform-output.json> <deploy-config> [wrangler.search.jsonc]
set -euo pipefail
usage="usage: prepare-deploy-config.sh <terraform-output.json> <deploy-config> [wrangler.search.jsonc]"
outputs="${1:?$usage}"
deploy_config="${2:?$usage}"
config="${3:-wrangler.search.jsonc}"
if [ "$(cd "$(dirname "$deploy_config")" && pwd -P)" != "$(cd "$(dirname "$config")" && pwd -P)" ]; then
  echo "::error title=wrangler.search.jsonc::$deploy_config must be in the same folder as $config (wrangler resolves paths relative to the config file)."
  exit 1
fi
if [ "$(realpath -m "$deploy_config")" = "$(realpath -m "$config")" ]; then
  echo "::error title=wrangler.search.jsonc::The deploy config must be a copy, never $config itself."
  exit 1
fi
# The deploy config takes the account from the committed file: it must be the account Terraform
# manages (the stack's `account_id` output; absent in hand-made outputs files).
tf_account="$(node -e 'const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(o.account_id?.value ?? "");' "$outputs")"
if [ -n "$tf_account" ] && ! [[ "$tf_account" =~ ^[0-9a-f]{32}$ ]]; then
  echo "::error title=wrangler.search.jsonc::Malformed Terraform account_id output."
  exit 1
fi
if [ -n "$tf_account" ] && ! grep -Eq "^[[:space:]]*\"account_id\":[[:space:]]*\"$tf_account\"" "$config"; then
  echo "::error title=wrangler.search.jsonc::account_id differs from the Terraform account_id output ($tf_account)."
  exit 1
fi
cp "$config" "$deploy_config"
node "$(dirname "$0")/sync-wrangler-ids.mjs" "$outputs" --config "$deploy_config"
read -r name id < <(node -e 'const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(o.database_name.value, o.database_id.value);' "$outputs")
if cmp -s "$config" "$deploy_config"; then
  match=true
  msg="$config matches the Terraform database id for $name."
  echo "$msg"
else
  match=false
  msg="$config does not bind the Terraform database id for $name ($id). This run deploys with the Terraform id from $deploy_config; the id sync PR brings the committed file up to date (infra/terraform/README.md, Rebuild from scratch)."
  echo "::warning title=wrangler.search.jsonc::$msg"
  diff "$config" "$deploy_config" || true
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$msg" >> "$GITHUB_STEP_SUMMARY"; fi
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "ids_match=$match"
    echo "database_name=$name"
    echo "database_id=$id"
  } >> "$GITHUB_OUTPUT"
fi
