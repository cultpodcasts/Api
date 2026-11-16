# Terraform: Cloudflare (search platform)

Terraform owns the **Cloudflare infrastructure** for the search platform: the D1 databases (SP-1.10,
[Api#270](https://github.com/cultpodcasts/Api/issues/270)) and the Worker shells their code is
deployed into (SP-1.11, [Api#273](https://github.com/cultpodcasts/Api/issues/273)); epic
[RedditPodcastPoster#1312](https://github.com/cultpodcasts/RedditPodcastPoster/issues/1312).
**Azure stays on bicep** (RedditPodcastPoster `Infrastructure/`): nothing here touches or wraps it.

| Path | What |
|------|------|
| [`modules/search-stack/`](./modules/search-stack) | One stack: D1 database (primary `weur`, read replication `auto`) + **empty** Worker shell (no workers.dev, no preview URLs). Both `prevent_destroy`. |
| [`search/production/`](./search/production) | Production: Worker `search`, D1 `cultpodcasts-search`. HCP workspace `cultpodcasts-api-search-d1`. |
| [`search/preview/`](./search/preview) | Preview (staging): Worker `search-preview`, D1 `cultpodcasts-search-preview`. HCP workspace `cultpodcasts-api-search-d1-preview`. |

## Terraform first, then the code

Jon, 16 Nov 2026: *"terraform is infra. it would always come before pure code deploy"*, and
*"if i wanted to tear everything down, i should be able to do that and run the ci again"*.

- **Code stays out of Terraform.** Terraform creates the Worker *shell* and the database;
  wrangler owns the script, bindings, vars and settings (`wrangler.search.jsonc`). The module
  ignores the settings wrangler writes (observability, logpush, tags, tail consumers) so the two
  never fight. Worker and database names here must match `wrangler.search.jsonc` (tested).
- **One job per stack runs, in order:** plan → plan guard → apply → check `wrangler.search.jsonc`
  ids against the Terraform outputs → D1 schema migrations (`workers/search/migrations`) →
  `wrangler deploy`. The deploy is the last step of the same job as the apply, so it only runs
  after a successful apply and migrations in that run.
- **No one-off manual infra.** Nothing is created by hand or by a local script. Tearing a stack
  down and re-running CI rebuilds it (see *Rebuild from scratch*).

| Event | Preview stack | Production stack |
|-------|---------------|------------------|
| PR from this repo (not forks) | **apply + migrations + `npm run deploy:search:preview`** in environment `cloudflare-preview` | plan only (read-only token) + sticky plan comment |
| Push to `main` | — | plan, then after **Jon's approval** in `cloudflare-production`: apply + migrations + `npm run deploy:search` |
| Manual run on `main` | — | as push; `allow_d1_create` lets the guard create the production database |

There is one preview stack, so **the last PR to deploy wins** (like `api-preview`). Only one
preview apply/deploy runs at a time (concurrency group `search-stack-preview`, never cancelled
mid-run). Fork PRs only get `fmt` and `validate`.

Triggers: changes under `infra/terraform/**`, `workers/search/**`, `wrangler.search.jsonc` or the
workflow. `package.json` is deliberately not a trigger: every Api PR bumps it, and that would
redeploy preview for unrelated PRs.

## Deletion protection

Jon, 16 Nov 2026: the database must be managed properly and must never be deleted by accident.

1. **`lifecycle { prevent_destroy = true }`** on the database and the Worker shell. Terraform
   refuses any plan that destroys or replaces them.
2. **Plan guard** ([`scripts/plan-guard.mjs`](./scripts/plan-guard.mjs)) reads
   `terraform show -json` before every apply (and on every PR plan) and fails on any `delete` or
   replace of a `cloudflare_d1_database` or `cloudflare_worker`, including when the resource block
   was removed (which takes `prevent_destroy` with it).
   - **D1 create** fails unless the run passes `--allow-d1-create`. A planned create of an existing
     stack means the database vanished from state, and applying it would quietly make an *empty*
     database with a *new* id. **Preview** always passes the flag: its data is a resyncable copy,
     and that is what lets CI rebuild a torn-down preview stack by itself. **Production** passes it
     only from a manual run with **`allow_d1_create`** ticked.
   - **Worker shell create** is always allowed: it is empty, the same job deploys into it, and it
     is what a rebuild needs. If a Worker of that name already exists outside state, the create
     fails loudly at apply; nothing is lost (import it instead).
   - **Forget** (a `removed { lifecycle { destroy = false } }` block) only drops a resource from
     one state and never touches Cloudflare. It is allowed and shown as a warning.
3. **Production apply needs approval.** It uses the GitHub environment `cloudflare-production` and
   only runs when that environment has a required reviewer; otherwise it is skipped with a warning.
4. **No destroy path.** No workflow runs `terraform destroy` or `plan -destroy`.
5. **Tokens.** Cloudflare's D1 and Workers Scripts permissions are *Read* or *Edit*, and Edit
   includes deleting (there is no edit-without-delete scope, and no per-database scope). So:
   - `TF_PLAN_CLOUDFLARE_API_TOKEN` (repo secret, **Read**): production plans on PRs and `main`.
   - `TF_APPLY_CLOUDFLARE_API_TOKEN` (environment secret on `cloudflare-production`, **Edit**):
     released only to the approved apply job on `main`.
   - `TF_PREVIEW_CLOUDFLARE_API_TOKEN` (environment secret on `cloudflare-preview`, **Edit**):
     released to the preview job on same-repo PRs.
   The readiness job fails if either Edit token is visible outside its environment (created as a
   repo secret by mistake). None is the repo's broader `CLOUDFLARE_API_TOKEN`.
   **Accepted risk:** the preview token is account-scoped, so a same-repo PR branch that edits the
   workflow could use it against production resources too. Only people with write access can push
   same-repo branches, fork PRs never get it, and the D1 Time Travel restore below still applies.
6. **Bound ids must match.** Before migrations and deploy, [`scripts/check-wrangler-ids.sh`](./scripts/check-wrangler-ids.sh)
   fails the job if `wrangler.search.jsonc` binds a different database id than Terraform manages.

Deliberately deleting or replacing a database or Worker is a manual, reviewed operation outside
CI: remove `prevent_destroy` in a PR that says why, take a Time Travel bookmark and an export first,
and run it by hand. CI will keep refusing.

### Backup and restore

- **D1 Time Travel** is always on: point-in-time restore to any minute in the retention window
  (30 days on Workers Paid, 7 on Free).
  ```sh
  npx wrangler d1 time-travel info cultpodcasts-search                         # current bookmark
  npx wrangler d1 time-travel restore cultpodcasts-search --timestamp=2026-11-16T14:00:00Z
  ```
  A restore overwrites the database in place (same id), so Terraform state is unaffected.
- **Optional:** a scheduled `wrangler d1 export cultpodcasts-search --remote --output=…` kept off-platform
  for copies beyond the Time Travel window. Not built; Jon to decide. The search index can also
  be rebuilt from Cosmos (SP-2.3), so it is not the system of record.

## State: HCP Terraform (own `cultpodcasts` organisation), one workspace per stack

State lives in **HCP Terraform**, in CultPodcasts' own organisation (never the freedomtimes one;
a test fails if it is), following the `cultpodcasts/freedomtimes` conventions
(`infra/terraform/environments/*/versions.tf`).

| Setting | Production | Preview |
|---------|------------|---------|
| Organisation | `cultpodcasts` | `cultpodcasts` |
| Workspace | `cultpodcasts-api-search-d1` | `cultpodcasts-api-search-d1-preview` |
| Execution Mode | **Local** | **Local** |
| Auth | `TF_TOKEN_app_terraform_io` (secret `TF_TOKEN_APP_TERRAFORM_IO`) | same |

Separate workspaces mean a PR's preview apply can never touch production state.

**Why Local execution:** plan and apply run on the GitHub runner with the Cloudflare token passed
as `TF_VAR_cloudflare_api_token`; HCP only stores and locks state. That also gives the runner the
saved plan the guard reads, and the apply runs exactly that guarded plan.

**One place per stack for the organisation and workspace:** the `cloud {}` block in each root's
`versions.tf`. **Pre-flight:** before every `terraform init`, CI runs
[`scripts/hcp-workspace-check.mjs`](./scripts/hcp-workspace-check.mjs), which fails clearly if the
workspace is missing, the token cannot see it, or its Execution Mode is not Local (otherwise `init`
would create it in the organisation's default Remote mode).

**HCP token:** a **user token**, or a **team token** for a team with **write** access to both
workspaces. Organisation tokens cannot lock state ("Error acquiring the state lock: resource not
found").

**Concurrency:** HCP locks state during every run, and every Terraform command waits up to five
minutes for the lock (`-lock-timeout=5m`). There is no workflow-level concurrency group. Production
plans use `search-stack-plan-<event>-<PR or ref>` and only PR plans cancel in progress. The preview
job uses `search-stack-preview` and production apply `search-stack-production`, both without
cancel-in-progress (a running apply is never cancelled; a newer queued run may supersede an older
queued one, re-plan and deploy the newer code).

### One-time state split (SP-1.11), done by CI

Before #273 the production workspace held **both** databases at root addresses (created by the
#270 first apply). No manual `terraform state` command is needed:

| Where | Block | Effect |
|-------|-------|--------|
| [`search/production/state-migration.tf`](./search/production/state-migration.tf) | `moved` `cloudflare_d1_database.search` → `module.search.cloudflare_d1_database.this` | prod database `f3d9b5b2-…` stays, same id, no change |
| same | `removed` `cloudflare_d1_database.search_preview`, `destroy = false` | prod state forgets the preview database; Cloudflare untouched |
| [`search/preview/adopt.tf`](./search/preview/adopt.tf) | `import` `83ae1e81-…` → `module.search.cloudflare_d1_database.this` | preview state adopts the existing preview database |

The first PR run imports the preview database into the preview workspace; until the production
apply on `main` forgets it, both states track it, which is harmless (neither plans a change).
The module ignores `primary_location_hint` changes because the API does not return it: without
that, the imported database would plan a forced replace (the guard would refuse it).

**Follow-up (on #273):** once both applies have run, delete `state-migration.tf` and `adopt.tf` in
a PR. The import would fail after a teardown (the id would no longer exist), so it must go for the
rebuild rule to hold.

## Rebuild from scratch

With the two HCP workspaces and the GitHub environments/secrets in place (bootstrap, below),
everything else is rebuilt by CI:

- **Preview:** any same-repo PR touching the trigger paths creates the D1 database and Worker shell,
  applies the migrations and deploys `search-preview`.
- **Production:** run the workflow on `main` with **`allow_d1_create`** ticked and approve: it
  creates the database and Worker shell, applies the migrations and deploys `search`.

New databases get new ids: the job fails at the id check, before any migration or deploy, until a
PR syncs them into `wrangler.search.jsonc` (below). That PR's own preview run then deploys preview;
merge it and re-run on `main` for production.

## Database ids into `wrangler.search.jsonc`

Ids are not secrets. With access to the workspaces:

```sh
terraform -chdir=infra/terraform/search/production output -json > /tmp/tf-production.json
terraform -chdir=infra/terraform/search/preview output -json > /tmp/tf-preview.json
node infra/terraform/scripts/sync-wrangler-ids.mjs /tmp/tf-production.json /tmp/tf-preview.json
```

Without HCP access, take `database_name` / `database_id` from the apply job's log into a JSON file
of the same shape (`{"database_name":{"value":…},"database_id":{"value":…}}`).

## What Jon creates (once): the bootstrap

Agents create no Cloudflare, HCP or GitHub environment resources and never see secret values.

1. **HCP Terraform** organisation `cultpodcasts` with two workspaces, both CLI-driven with
   **Execution Mode: Local** and no workspace variables:
   `cultpodcasts-api-search-d1` (exists) and **`cultpodcasts-api-search-d1-preview`** (new).
   `TF_TOKEN_APP_TERRAFORM_IO` must be able to write both.
2. **Cloudflare API tokens** (My Profile → API Tokens → Custom), each limited to account
   `bae3f835f19899c6eee1ec48f2d658cf`:
   - **Plan token** (`TF_PLAN_CLOUDFLARE_API_TOKEN`): Account → **D1 → Read**, Account →
     **Workers Scripts → Read**.
   - **Apply token** (`TF_APPLY_CLOUDFLARE_API_TOKEN`): Account → **D1 → Edit**, Account →
     **Workers Scripts → Edit** (apply, migrations and `wrangler deploy`).
   - **Preview token** (`TF_PREVIEW_CLOUDFLARE_API_TOKEN`): Account → **D1 → Edit**, Account →
     **Workers Scripts → Edit**.
3. **GitHub environments** (Settings → Environments):
   - `cloudflare-production`: **Required reviewers: Jon**, deployment branches `main` only, secret
     `TF_APPLY_CLOUDFLARE_API_TOKEN`.
   - **`cloudflare-preview`**: no reviewers, deployment branches **All branches** (PR runs use
     the PR's branch), secret **`TF_PREVIEW_CLOUDFLARE_API_TOKEN`**.
   Do **not** also create either Edit token as a repo secret: the workflow fails if it can see one
   outside its environment.
4. **GitHub repo secrets:** `TF_TOKEN_APP_TERRAFORM_IO` and `TF_PLAN_CLOUDFLARE_API_TOKEN`.

The account id is not a secret; it defaults in each root's `variables.tf` and reaches the
migrations config through the `account_id` output.

## Local checks (no credentials)

```sh
terraform fmt -check -recursive infra/terraform
for d in infra/terraform/search/production infra/terraform/search/preview; do
  terraform -chdir=$d init -backend=false && terraform -chdir=$d validate
done
npx vitest run tests/search-stack-terraform.spec.ts
```
