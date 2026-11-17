#!/usr/bin/env bash
# Open (or update) the PR that syncs a rebuilt search stack's Terraform D1 id into the committed
# wrangler.search.jsonc (#279, option 3). Runs in its own workflow job AFTER that stack's apply,
# migrations and deploy succeeded with the Terraform id, and only when the committed id differed.
#
# Idempotent:
#   - one fixed branch per stack: ci/sync-search-d1-id-<stack>;
#   - nothing to do when main already has the Terraform id (no branch push, no PR);
#   - an existing branch is updated with a merge commit (main merged in, then the id), never
#     force-pushed; an already-open PR from that branch is updated, never duplicated.
#
# The PR is opened with the workflow's GITHUB_TOKEN, so GitHub does not start other workflows
# for it (Test, Search stack). Close and reopen it (or push to it) to run CI; see
# infra/terraform/README.md (Rebuild from scratch). If the repo does not allow GitHub Actions to
# create pull requests, the branch is still pushed and the job warns with a compare link.
#
# Usage (repo root, clean checkout with history; GH_TOKEN and GITHUB_REPOSITORY set):
#   open-id-sync-pr.sh <preview|production> <terraform-output.json> [path/to/sync-wrangler-ids.mjs]
set -euo pipefail
usage="usage: open-id-sync-pr.sh <preview|production> <terraform-output.json> [sync-wrangler-ids.mjs]"
stack="${1:?$usage}"
outputs="${2:?$usage}"
sync="${3:-$(dirname "$0")/sync-wrangler-ids.mjs}"
case "$stack" in
  preview | production) ;;
  *) echo "$usage" >&2; exit 2 ;;
esac
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
base="${SYNC_BASE_BRANCH:-main}"
branch="ci/sync-search-d1-id-$stack"
config="wrangler.search.jsonc"
read -r name id < <(node -e 'const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(o.database_name.value, o.database_id.value);' "$outputs")

git fetch --no-tags origin "$base"
if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  git fetch --no-tags origin "$branch"
  git switch --quiet -C "$branch" "origin/$branch"
  # Merge commit, never a rebase or force-push: keeps the branch fast-forward on the remote.
  if ! git -c user.name="github-actions[bot]" -c user.email="41898189+github-actions[bot]@users.noreply.github.com" \
    merge --no-edit "origin/$base"; then
    git merge --abort || true
    echo "::error title=Search D1 id sync::Could not merge $base into $branch. Resolve it by hand (merge commit), or close the PR and delete the branch so the next run starts fresh."
    exit 1
  fi
else
  git switch --quiet -C "$branch" "origin/$base"
fi

node "$sync" "$outputs" --config "$config"

if git diff --quiet "origin/$base" -- "$config"; then
  echo "$base already binds $name to the Terraform id $id: no sync PR needed."
  stale="$(gh pr list --repo "$repo" --head "$branch" --base "$base" --state open --json url --jq '.[0].url // empty')"
  if [ -n "$stale" ]; then
    # Closing is a human call; CI only says so.
    echo "::notice title=Search D1 id sync::$base already has the $stack id; the open sync PR $stale is no longer needed."
  fi
  exit 0
fi

if ! git diff --quiet -- "$config"; then
  git add -- "$config"
  git -c user.name="github-actions[bot]" -c user.email="41898189+github-actions[bot]@users.noreply.github.com" \
    commit --quiet -m "Sync $stack search D1 id from Terraform ($name = $id)" \
    -m "Opened by the Search stack workflow after a rebuild (#279). Ids are not secrets."
fi
git push origin "HEAD:refs/heads/$branch"

existing="$(gh pr list --repo "$repo" --head "$branch" --base "$base" --state open --json url --jq '.[0].url // empty')"
if [ -n "$existing" ]; then
  echo "Updated the open id sync PR: $existing"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "Updated the open $stack D1 id sync PR: $existing" >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

body="$(cat <<BODY
The **$stack** search stack was rebuilt: Terraform manages \`$name\` with id \`$id\`, which \`$config\` on \`$base\` does not bind yet.

The Search stack run already applied the migrations and deployed with the Terraform id from a temporary copy of \`$config\` (#279, option 3), so nothing is down. This PR only brings the committed file up to date (\`infra/terraform/scripts/sync-wrangler-ids.mjs\`). Ids are not secrets.

**CI did not run on this PR:** it was opened with the workflow's \`GITHUB_TOKEN\`, which does not start other workflows. Close and reopen it to run Test and the Search stack preview job.

Merging it changes \`$config\` on \`$base\`, so the Search stack production job runs and waits for approval in \`cloudflare-production\`; with the ids in sync its apply is a no-op and it redeploys the same code.

Run: ${GITHUB_SERVER_URL:-https://github.com}/$repo/actions/runs/${GITHUB_RUN_ID:-unknown}
BODY
)"
if url="$(gh pr create --repo "$repo" --base "$base" --head "$branch" \
  --title "Sync $stack search D1 id from Terraform" --body "$body")"; then
  echo "Opened the id sync PR: $url"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "Opened the $stack D1 id sync PR: $url" >> "$GITHUB_STEP_SUMMARY"
else
  compare="${GITHUB_SERVER_URL:-https://github.com}/$repo/compare/$base...$branch?expand=1"
  echo "::warning title=Search D1 id sync::Pushed $branch but could not open the PR (is 'Allow GitHub Actions to create and approve pull requests' off?). Open it by hand: $compare"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "Pushed $branch; open the PR by hand: $compare" >> "$GITHUB_STEP_SUMMARY"
fi
exit 0
