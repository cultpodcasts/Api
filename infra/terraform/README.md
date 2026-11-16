# Terraform: Cloudflare (search platform)

Terraform owns the **Cloudflare** resources for the search platform (SP-1.10,
[Api#270](https://github.com/cultpodcasts/Api/issues/270); epic
[RedditPodcastPoster#1312](https://github.com/cultpodcasts/RedditPodcastPoster/issues/1312)).
**Azure stays on bicep** (RedditPodcastPoster `Infrastructure/`): nothing here touches or wraps it.

| Stack | Manages |
|-------|---------|
| [`search-d1/`](./search-d1) | D1 `cultpodcasts-search` (Worker `search`) and `cultpodcasts-search-preview` (Worker `search-preview`), both primary in `weur`, read replication `auto` |

The schema is not Terraform's job: after apply, CI runs `wrangler d1 migrations apply --remote`
with `workers/search/migrations` (added by SP-1.1, Api#219), preview first, then production.

## Deletion protection

Jon, 16 Nov 2026: the database must be managed properly and must never be deleted by accident.

1. **`lifecycle { prevent_destroy = true }`** on both databases. Terraform refuses any plan that
   destroys or replaces them.
2. **Plan guard** ([`scripts/plan-guard.mjs`](./scripts/plan-guard.mjs)) reads
   `terraform show -json` and fails on any `delete` or replace of a `cloudflare_d1_database`. It
   runs on every PR plan and again right before apply. It also covers the gap in
   `prevent_destroy`: if someone deletes the resource block, `prevent_destroy` goes with it, but
   the guard still sees the planned delete and fails.
   It also fails on a plain **create** of a D1 database unless the run was started by hand with
   **`allow_d1_create`** ticked (meant for the first apply only). After that, a planned create
   means a database vanished from state (deleted outside Terraform, or drift), and applying it
   would quietly make an *empty* database with a *new* id while the Worker still points at the
   old one. Investigate instead: D1 Time Travel, or import (below).
3. **Apply needs approval.** The apply job uses the GitHub environment `cloudflare-production`,
   and only runs when that environment has a required reviewer. Without one, apply is skipped
   with a warning; it never runs unprotected.
4. **No destroy path.** No workflow runs `terraform destroy` or `plan -destroy`.
5. **Two tokens: Read for plans, Edit only after approval.** Cloudflare's D1 token permission is
   either *Read* or *Edit*, and Edit includes deleting databases (there is no edit-without-delete
   scope). PR plans run the PR's own Terraform config and workflow, where `prevent_destroy` and
   the guard can be edited away, so plans get only a **D1 Read** token
   (`TF_PLAN_CLOUDFLARE_API_TOKEN`, repo secret). The **D1 Edit** token
   (`TF_APPLY_CLOUDFLARE_API_TOKEN`) is an **environment secret on `cloudflare-production`**:
   GitHub releases it only to the apply job on `main`, after Jon approves. The readiness job
   fails if the Edit token is visible outside that environment (i.e. was created as a repo
   secret by mistake). Neither is the repo's broader `CLOUDFLARE_API_TOKEN`.
6. **Bound ids must match.** After apply, real ids in `wrangler.search.jsonc` that differ from
   Terraform's outputs fail the run (placeholders before the sync PR only warn).

Deliberately deleting or replacing a database is a manual, reviewed operation outside CI:
remove `prevent_destroy` in a PR that says why, take a Time Travel bookmark and an export first,
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

## State: HCP Terraform (same as cultpodcasts/freedomtimes)

State lives in **HCP Terraform**, following `cultpodcasts/freedomtimes`
(`infra/terraform/environments/*/versions.tf`):

| Setting | Value |
|---------|-------|
| Organisation | `freedomtimes` (the same organisation freedomtimes uses), pending Jon's call on a separate `cultpodcasts` organisation |
| Workspace | `cultpodcasts-api-search-d1` (`<repo>-<stack>`, like `freedomtimes-production`) |
| Execution Mode | **Local** |
| Auth | `TF_TOKEN_app_terraform_io` (GitHub secret `TF_TOKEN_APP_TERRAFORM_IO`) |

**Why Local execution:** as in freedomtimes, plan and apply run on the GitHub runner with the
Cloudflare token passed as `TF_VAR_cloudflare_api_token` from a GitHub secret; HCP only stores and
locks the state. Local execution also gives the runner a saved plan file, so the plan guard can
read `terraform show -json tfplan` and the apply runs exactly that guarded plan. With Remote
execution the `TF_VAR_*` secrets would not reach the run and the guard would have no local plan.

**One place to change the organisation or workspace:** the `cloud {}` block in
[`search-d1/versions.tf`](./search-d1/versions.tf). Nothing else repeats them; the CI pre-flight
reads them from that block. To move to another organisation, create the workspace there (step 1
below), change `organization`, update `TF_TOKEN_APP_TERRAFORM_IO`, and migrate state with
`terraform init -migrate-state` (or let the first apply create the databases if none exist yet).

**Pre-flight:** before every `terraform init`, CI runs
[`scripts/hcp-workspace-check.mjs`](./scripts/hcp-workspace-check.mjs). It asks the HCP API for
that workspace and fails with a clear error if it is missing, the token cannot see it, or its
Execution Mode is not Local. Without it, `init` would create the workspace with the
organisation's default mode and `plan -out` would fail with a cryptic error.

**Concurrency:** HCP locks state during every run, and every Terraform command waits up to five
minutes for the lock (`-lock-timeout=5m`). There is no workflow-level concurrency group (GitHub
cancels a *pending* run when another queues, which could drop a main apply). Instead, PR plans
use `terraform-search-d1-plan-<PR>` with cancel-in-progress (a newer push supersedes the older
plan), and apply uses `terraform-search-d1-apply` without cancel-in-progress (a running apply is
never cancelled; a newer main run may supersede a pending one, re-plan, and apply all pending
migrations).

## CI ([`.github/workflows/terraform-search-d1.yml`](../../.github/workflows/terraform-search-d1.yml))

| Event | Runs |
|-------|------|
| PR touching `infra/terraform/**`, `workers/search/migrations/**` or the workflow | `fmt -check`, `validate` (no secrets); with secrets: HCP pre-flight, `plan` (D1 Read token), plan guard, one sticky plan comment per PR showing the head SHA |
| Push to `main` (same paths), or manual run on `main` | `plan` + guard, then **apply** after environment approval: re-plan, guard, `apply` of that saved plan (D1 Edit token), then D1 migrations (preview, then production) from a wrangler config generated from Terraform outputs |
| Manual run with `allow_d1_create` | As above, but the guard allows creating D1 databases. **First apply only.** |

**Safe before setup:** with any secret missing, plan and apply are skipped with a notice and the
run stays green. Fork PRs never get secrets, so they only run fmt and validate.

## What Jon creates (once)

Agents create no Cloudflare or HCP resources and never see secret values.

1. **HCP Terraform workspace** `cultpodcasts-api-search-d1` in organisation `freedomtimes`
   (or the new organisation, if Jon moves it; see State above), CLI-driven workflow, with
   **Execution Mode: Local**. No workspace variables are needed: credentials come from GitHub
   secrets as `TF_VAR_*`, as in freedomtimes.
2. **Two Cloudflare API tokens** (My Profile → API Tokens → Custom), each with account resources
   limited to account `bae3f835f19899c6eee1ec48f2d658cf` (optional: client IP filtering, expiry):
   - **Plan token:** Account → **D1 → Read**
   - **Apply token:** Account → **D1 → Edit** (Terraform apply and the D1 migrations)
3. **GitHub environment** `cloudflare-production` (Settings → Environments) with **Required
   reviewers: Jon**, deployment branches limited to `main`, and one **environment secret**:
   - `TF_APPLY_CLOUDFLARE_API_TOKEN`: the D1 **Edit** token. Do **not** also create it as a repo
     secret; the workflow fails if it can see it outside the environment.
4. **GitHub repo secrets** on cultpodcasts/Api (Settings → Secrets and variables → Actions):
   - `TF_TOKEN_APP_TERRAFORM_IO`: an HCP Terraform **team token** for a team with access to
     this workspace only (same secret name as freedomtimes). A token scoped to one workspace
     limits what a PR plan could do with it.
   - `TF_PLAN_CLOUDFLARE_API_TOKEN`: the D1 **Read** token.

The account id is not a secret; it defaults in `variables.tf` (override locally with
`TF_VAR_cloudflare_account_id` if ever needed) and reaches the migrations config through the
`account_id` output.

Then run the workflow on `main` with **`allow_d1_create` ticked** (Actions → Terraform (search
D1) → Run workflow), check the plan shows exactly two creates, and approve. Later runs leave it
unticked.

## After the first apply: database ids into `wrangler.search.jsonc`

`wrangler.search.jsonc` (SP-1.1) starts with placeholder ids. After apply, put the real ids in
with a PR (ids are not secrets):

```sh
terraform -chdir=infra/terraform/search-d1 output -json > /tmp/tf-outputs.json
node infra/terraform/scripts/sync-wrangler-ids.mjs /tmp/tf-outputs.json wrangler.search.jsonc
```

Locally, `terraform output` needs `TF_TOKEN_app_terraform_io` with access to the workspace.
Without it, take `search_database_id` / `search_preview_database_id` from the
apply job's log (or the dashboard) into a JSON file of the same shape. The apply job also checks
`wrangler.search.jsonc` against the outputs: placeholders warn, real ids that differ fail.

## Adopting databases that already exist

If either database was created outside Terraform, import it instead of creating a duplicate: set
`import_search_database_id` / `import_search_preview_database_id` (as a
`TF_VAR_…` env in a one-off run), plan, check it shows an import and no create, apply, then set
the variable back to `null`. The demo database `search-demo-db` stays out of Terraform.

## Local checks (no credentials)

```sh
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/search-d1 init -backend=false   # no HCP access needed
terraform -chdir=infra/terraform/search-d1 validate
npx vitest run tests/terraform-search-d1.spec.ts
```
