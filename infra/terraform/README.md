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
3. **Apply needs approval.** The apply job uses the GitHub environment `cloudflare-production`,
   and only runs when that environment has a required reviewer. Without one, apply is skipped
   with a warning; it never runs unprotected.
4. **No destroy path.** No workflow runs `terraform destroy` or `plan -destroy`.
5. **Least-privilege token, with a caveat.** Cloudflare's D1 token permission is either *Read* or
   *Edit*, and Edit includes deleting databases. There is no edit-without-delete scope. So the
   token cannot be the protection; items 1–4 are. The token is still scoped to this account and
   D1 only, and is separate from the repo's existing `CLOUDFLARE_API_TOKEN`.

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
- **Optional:** a scheduled `wrangler d1 export cultpodcasts-search --remote --output=…` to R2
  for copies beyond the Time Travel window. Not built; Jon to decide. The search index can also
  be rebuilt from Cosmos (SP-2.3), so it is not the system of record.

## State

Remote state lives in R2 bucket **`cultpodcasts-terraform-state`**, key
`api/search-d1/terraform.tfstate`, through the S3-compatible backend. R2 supports conditional
`PutObject`, so `use_lockfile = true` gives real state locking. The workflow also allows only one
Terraform run at a time (`concurrency: terraform-search-d1`).

## CI ([`.github/workflows/terraform-search-d1.yml`](../../.github/workflows/terraform-search-d1.yml))

| Event | Runs |
|-------|------|
| PR touching `infra/terraform/**`, `workers/search/migrations/**` or the workflow | `fmt -check`, `validate` (no secrets); with secrets: `plan`, plan guard, plan posted as a PR comment |
| Push to `main` (same paths), or manual run on `main` | `plan` + guard, then **apply** after environment approval: re-plan, guard, `apply` of that saved plan, then D1 migrations (preview, then production) |

**Safe before setup:** with any secret missing, plan and apply are skipped with a notice and the
run stays green. Fork PRs never get secrets, so they only run fmt and validate.

## What Jon creates (once)

Agents create no Cloudflare resources and never see secret values.

1. **R2 bucket** `cultpodcasts-terraform-state` (dashboard → R2 → Create bucket). Optionally add
   a bucket lock rule so state objects cannot be deleted.
2. **R2 API token for state** (R2 → Manage API tokens): *Object Read & Write*, scoped to that
   bucket only. Keep its **Access Key ID** and **Secret Access Key**.
3. **Cloudflare API token for Terraform and migrations** (My Profile → API Tokens → Custom):
   - Permissions: **Account → D1 → Edit**
   - Account resources: include only account `bae3f835f19899c6eee1ec48f2d658cf`
   - Optional: client IP filtering, expiry date
4. **GitHub repo secrets** on cultpodcasts/Api (Settings → Secrets and variables → Actions):
   - `TF_CLOUDFLARE_API_TOKEN` (from step 3)
   - `TF_STATE_R2_ACCESS_KEY_ID` (from step 2)
   - `TF_STATE_R2_SECRET_ACCESS_KEY` (from step 2)
5. **GitHub environment** `cloudflare-production` (Settings → Environments) with **Required
   reviewers: Jon**, and deployment branches limited to `main`.

The account id and R2 endpoint are not secrets; they are in the config.

Then run the workflow on `main` (Actions → Terraform (search D1) → Run workflow), check the plan
shows exactly two creates, and approve.

## After the first apply: database ids into `wrangler.search.jsonc`

`wrangler.search.jsonc` (SP-1.1) starts with placeholder ids. After apply, put the real ids in
with a PR (ids are not secrets):

```sh
terraform -chdir=infra/terraform/search-d1 output -json > /tmp/tf-outputs.json
node infra/terraform/scripts/sync-wrangler-ids.mjs /tmp/tf-outputs.json wrangler.search.jsonc
```

Without local state access, take `search_database_id` / `search_preview_database_id` from the
apply job's log (or the dashboard) into a JSON file of the same shape. The apply job also checks
`wrangler.search.jsonc` against the outputs and warns when they differ.

## Adopting databases that already exist

If either database was created outside Terraform, import it instead of creating a duplicate: set
`import_search_database_id` / `import_search_preview_database_id` (for example in a
`TF_VAR_…` env or a tfvars file), plan, check it shows an import and no create, apply, then set
the variable back to `null`. The demo database `search-demo-db` stays out of Terraform.

## Local checks (no credentials)

```sh
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/search-d1 init -backend=false
terraform -chdir=infra/terraform/search-d1 validate
npx vitest run tests/terraform-search-d1.spec.ts
```
